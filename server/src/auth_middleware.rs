use crate::db;
use crate::models::SessionUser;
use actix_web::{
    body::BoxBody,
    dev::{Service, ServiceRequest, ServiceResponse, Transform},
    web, Error, FromRequest, HttpMessage, HttpRequest,
};
use deadpool_postgres::Pool;
use futures_util::{
    future::{ready, LocalBoxFuture, Ready},
    FutureExt,
};
use std::{
    collections::HashMap,
    rc::Rc,
    sync::{Arc, RwLock},
    time::{Duration, Instant},
};

const AUTH_CACHE_TTL: Duration = Duration::from_secs(300);
const AUTH_CACHE_MAX_ENTRIES: usize = 10_000;
const AUTH_CACHE_SWEEP_INTERVAL: Duration = Duration::from_secs(60);

#[derive(Hash, Eq, PartialEq)]
struct AuthenticationCacheKey {
    group_name: String,
    token_hash: String,
}

struct CachedAuthentication {
    group_id: i64,
    expires_at: Instant,
}

struct AuthenticationCacheInner {
    entries: HashMap<AuthenticationCacheKey, CachedAuthentication>,
    last_sweep: Instant,
}

pub struct AuthenticationCache {
    inner: RwLock<AuthenticationCacheInner>,
}

impl AuthenticationCache {
    pub fn new() -> Self {
        Self {
            inner: RwLock::new(AuthenticationCacheInner {
                entries: HashMap::new(),
                last_sweep: Instant::now(),
            }),
        }
    }

    fn get(&self, group_name: &str, token_hash: &str) -> Option<i64> {
        let inner = self.inner.read().ok()?;
        let key = AuthenticationCacheKey {
            group_name: group_name.to_owned(),
            token_hash: token_hash.to_owned(),
        };
        inner
            .entries
            .get(&key)
            .filter(|entry| entry.expires_at > Instant::now())
            .map(|entry| entry.group_id)
    }

    fn insert(&self, group_name: &str, token_hash: String, group_id: i64) {
        let Ok(mut inner) = self.inner.write() else {
            return;
        };
        let now = Instant::now();
        if now.duration_since(inner.last_sweep) >= AUTH_CACHE_SWEEP_INTERVAL {
            inner.entries.retain(|_, entry| entry.expires_at > now);
            inner.last_sweep = now;
        }
        if inner.entries.len() >= AUTH_CACHE_MAX_ENTRIES {
            return;
        }
        inner.entries.insert(
            AuthenticationCacheKey {
                group_name: group_name.to_owned(),
                token_hash,
            },
            CachedAuthentication {
                group_id,
                expires_at: now + AUTH_CACHE_TTL,
            },
        );
    }
}

impl Default for AuthenticationCache {
    fn default() -> Self {
        Self::new()
    }
}

pub struct AuthenticateMiddlewareFactory {
    cache: Arc<AuthenticationCache>,
}
impl AuthenticateMiddlewareFactory {
    pub fn new(cache: Arc<AuthenticationCache>) -> Self {
        AuthenticateMiddlewareFactory { cache }
    }
}
impl<S, B> Transform<S, ServiceRequest> for AuthenticateMiddlewareFactory
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    B: actix_web::body::MessageBody + 'static,
{
    type Response = ServiceResponse<BoxBody>;
    type Error = Error;
    type InitError = ();
    type Transform = AuthenticateMiddleware<S>;
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ready(Ok(AuthenticateMiddleware {
            service: Rc::new(service),
            cache: Arc::clone(&self.cache),
        }))
    }
}


// Legacy group auth result (kept for backward compatibility with authed routes)
pub struct AuthenticationResult {
    pub group_id: i64,
}
type AuthenticationInfo = Rc<AuthenticationResult>;
pub struct Authenticated(AuthenticationInfo);
impl std::ops::Deref for Authenticated {
    type Target = AuthenticationInfo;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}
impl FromRequest for Authenticated {
    type Error = Error;
    type Future = Ready<Result<Self, Self::Error>>;

    fn from_request(req: &HttpRequest, _payload: &mut actix_web::dev::Payload) -> Self::Future {
        let value = req.extensions().get::<AuthenticationInfo>().cloned();
        let result = match value {
            Some(v) => Ok(Authenticated(v)),
            None => Err(actix_web::error::ErrorUnauthorized("")),
        };
        ready(result)
    }
}

// Session-based auth result
pub struct SessionAuthResult {
    pub user: SessionUser,
    pub group_id: i64,
}
type SessionAuthInfo = Rc<SessionAuthResult>;
pub struct SessionAuthenticated(SessionAuthInfo);
impl std::ops::Deref for SessionAuthenticated {
    type Target = SessionAuthInfo;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}
impl FromRequest for SessionAuthenticated {
    type Error = Error;
    type Future = Ready<Result<Self, Self::Error>>;

    fn from_request(req: &HttpRequest, _payload: &mut actix_web::dev::Payload) -> Self::Future {
        let value = req.extensions().get::<SessionAuthInfo>().cloned();
        let result = match value {
            Some(v) => Ok(SessionAuthenticated(v)),
            None => Err(actix_web::error::ErrorUnauthorized("Not authenticated")),
        };
        ready(result)
    }
}

// Admin guard
pub struct AdminAuthenticated(SessionAuthInfo);
impl std::ops::Deref for AdminAuthenticated {
    type Target = SessionAuthInfo;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}
impl FromRequest for AdminAuthenticated {
    type Error = Error;
    type Future = Ready<Result<Self, Self::Error>>;

    fn from_request(req: &HttpRequest, _payload: &mut actix_web::dev::Payload) -> Self::Future {
        let value = req.extensions().get::<SessionAuthInfo>().cloned();
        let result = match value {
            Some(v) => {
                if v.user.role == "admin" {
                    Ok(AdminAuthenticated(v))
                } else {
                    Err(actix_web::error::ErrorForbidden("Admin access required"))
                }
            }
            None => Err(actix_web::error::ErrorUnauthorized("Not authenticated")),
        };
        ready(result)
    }
}

pub struct AuthenticateMiddleware<S> {
    service: Rc<S>,
    cache: Arc<AuthenticationCache>,
}

/// Authenticate against the database on cache miss.
/// Returns Ok(group_id) on success, or an error response to return directly.
async fn authenticate_via_db(
    req: &ServiceRequest,
    group_name: &str,
    token: &str,
    token_hash: &str,
    cache: &AuthenticationCache,
) -> Result<i64, actix_web::Error> {
    let db_pool = req
        .app_data::<web::Data<Pool>>()
        .ok_or_else(|| actix_web::error::ErrorInternalServerError(""))?;
    let client = db_pool
        .get()
        .await
        .map_err(|_| actix_web::error::ErrorInternalServerError(""))?;

    let group_id = db::get_group(&client, group_name, token)
        .await
        .map_err(|_| actix_web::error::ErrorUnauthorized(""))?;

    cache.insert(group_name, token_hash.to_owned(), group_id);
    Ok(group_id)
}

impl<S, B> Service<ServiceRequest> for AuthenticateMiddleware<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    B: actix_web::body::MessageBody + 'static,
{
    type Response = ServiceResponse<BoxBody>;
    type Error = Error;
    type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;
    fn poll_ready(
        &self,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Result<(), Self::Error>> {
        self.service.poll_ready(cx)
    }

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let srv = Rc::clone(&self.service);
        let cache = Arc::clone(&self.cache);

        async move {
            let group_name = match req.match_info().get("group_name") {
                Some(group_name) => group_name,
                None => {
                    return Ok(req.error_response(actix_web::error::ErrorBadRequest(
                        "Missing group name from request",
                    )));
                }
            };

            if group_name != "_" {
                let auth_header = match req.headers().get("Authorization") {
                    Some(auth_header) => auth_header,
                    None => {
                        return Ok(req.error_response(actix_web::error::ErrorBadRequest(
                            "Authorization header missing from request",
                        )));
                    }
                };
                let token = match auth_header.to_str() {
                    Ok(token) => token,
                    Err(_) => {
                        return Ok(req.error_response(actix_web::error::ErrorBadRequest(
                            "Unable to parse Authorization header",
                        )));
                    }
                };

                let token_hash = crate::crypto::token_hash(token, group_name);
                let group_id = match cache.get(group_name, &token_hash) {
                    Some(group_id) => group_id,
                    None => match authenticate_via_db(&req, group_name, token, &token_hash, &cache)
                        .await
                    {
                        Ok(group_id) => group_id,
                        Err(e) => return Ok(req.error_response(e)),
                    },
                };

                let authentication_result = AuthenticationResult { group_id };
                req.extensions_mut()
                    .insert::<AuthenticationInfo>(Rc::new(authentication_result));
            }

            let res = srv.call(req).await?;
            Ok(res.map_into_boxed_body())
        }
        .boxed_local()
    }
}

// Session cookie middleware
pub struct SessionMiddlewareFactory;
impl SessionMiddlewareFactory {
    pub fn new() -> Self {
        SessionMiddlewareFactory {}
    }
}
impl<S, B> Transform<S, ServiceRequest> for SessionMiddlewareFactory
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    B: actix_web::body::MessageBody + 'static,
{
    type Response = ServiceResponse<BoxBody>;
    type Error = Error;
    type InitError = ();
    type Transform = SessionMiddleware<S>;
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ready(Ok(SessionMiddleware {
            service: Rc::new(service),
        }))
    }
}

pub struct SessionMiddleware<S> {
    service: Rc<S>,
}

fn extract_session_token(req: &ServiceRequest) -> Option<String> {
    // Try cookie first
    if let Some(cookie) = req.cookie("session") {
        return Some(cookie.value().to_string());
    }
    // Fall back to Authorization header (for API clients)
    if let Some(auth_header) = req.headers().get("Authorization") {
        if let Ok(value) = auth_header.to_str() {
            if let Some(token) = value.strip_prefix("Bearer ") {
                return Some(token.to_string());
            }
        }
    }
    None
}

impl<S, B> Service<ServiceRequest> for SessionMiddleware<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    B: actix_web::body::MessageBody + 'static,
{
    type Response = ServiceResponse<BoxBody>;
    type Error = Error;
    type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;
    fn poll_ready(
        &self,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Result<(), Self::Error>> {
        self.service.poll_ready(cx)
    }

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let srv = Rc::clone(&self.service);

        async move {
            let session_token = match extract_session_token(&req) {
                Some(token) => token,
                None => {
                    return Ok(
                        req.error_response(actix_web::error::ErrorUnauthorized("Not authenticated"))
                    );
                }
            };

            let db_pool = match req.app_data::<web::Data<Pool>>() {
                Some(db_pool) => db_pool,
                None => {
                    return Ok(
                        req.error_response(actix_web::error::ErrorInternalServerError(""))
                    );
                }
            };
            let client = match db_pool.get().await {
                Ok(client) => client,
                Err(_) => {
                    return Ok(
                        req.error_response(actix_web::error::ErrorInternalServerError(""))
                    );
                }
            };

            let user = match db::get_session_user(&client, &session_token).await {
                Ok(user) => user,
                Err(_) => {
                    return Ok(
                        req.error_response(actix_web::error::ErrorUnauthorized("Invalid or expired session"))
                    );
                }
            };

            // Get the singleton group_id
            let group_id_data = req.app_data::<web::Data<i64>>();
            let group_id: i64 = match group_id_data {
                Some(gid) => *gid.get_ref(),
                None => {
                    return Ok(
                        req.error_response(actix_web::error::ErrorInternalServerError("No group configured"))
                    );
                }
            };

            // Update last seen (best effort)
            let _ = db::update_user_last_seen(&client, user.user_id).await;

            let session_result = SessionAuthResult { user, group_id };
            req.extensions_mut()
                .insert::<SessionAuthInfo>(Rc::new(session_result));

            // Also inject legacy auth info so existing authed routes work
            let auth_result = AuthenticationResult { group_id };
            req.extensions_mut()
                .insert::<AuthenticationInfo>(Rc::new(auth_result));

            let res = srv.call(req).await?;
            Ok(res.map_into_boxed_body())
        }
        .boxed_local()
    }
}

#[cfg(test)]
mod tests {
    use super::AuthenticationCache;

    #[test]
    fn caches_successful_authentication_by_group_and_token_hash() {
        let cache = AuthenticationCache::new();
        cache.insert("ironmen", "valid-token-hash".to_owned(), 42);

        assert_eq!(cache.get("ironmen", "valid-token-hash"), Some(42));
        assert_eq!(cache.get("ironmen", "other-token-hash"), None);
        assert_eq!(cache.get("other-group", "valid-token-hash"), None);
    }
}
