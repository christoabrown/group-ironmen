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
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

/// How often a user's `last_seen` is written at most. Every request is
/// authenticated, and the site polls every couple of seconds.
const LAST_SEEN_WRITE_INTERVAL: Duration = Duration::from_secs(60);

/// Remembers when each user's `last_seen` was last written, shared by every
/// scope's session middleware.
#[derive(Clone, Default)]
pub struct LastSeenThrottle(Arc<Mutex<HashMap<i64, Instant>>>);

impl LastSeenThrottle {
    /// Whether `last_seen` should be written for this user now; records the write if so.
    pub fn should_write(&self, user_id: i64) -> bool {
        let Ok(mut written) = self.0.lock() else {
            return true;
        };
        let now = Instant::now();
        if written.len() > 10_000 {
            written.retain(|_, at| now.duration_since(*at) < LAST_SEEN_WRITE_INTERVAL);
        }
        match written.get(&user_id) {
            Some(at) if now.duration_since(*at) < LAST_SEEN_WRITE_INTERVAL => false,
            _ => {
                written.insert(user_id, now);
                true
            }
        }
    }
}

// The group every session belongs to (there is a single guild group).
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

// Session cookie middleware
pub struct SessionMiddlewareFactory {
    last_seen: LastSeenThrottle,
}
impl SessionMiddlewareFactory {
    pub fn new(last_seen: LastSeenThrottle) -> Self {
        SessionMiddlewareFactory { last_seen }
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
            last_seen: self.last_seen.clone(),
        }))
    }
}

pub struct SessionMiddleware<S> {
    service: Rc<S>,
    last_seen: LastSeenThrottle,
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
        let last_seen = self.last_seen.clone();

        async move {
            let session_token = match extract_session_token(&req) {
                Some(token) => token,
                None => {
                    return Ok(req
                        .error_response(actix_web::error::ErrorUnauthorized("Not authenticated")));
                }
            };

            let db_pool = match req.app_data::<web::Data<Pool>>() {
                Some(db_pool) => db_pool,
                None => {
                    return Ok(req.error_response(actix_web::error::ErrorInternalServerError("")));
                }
            };
            let client = match db_pool.get().await {
                Ok(client) => client,
                Err(_) => {
                    return Ok(req.error_response(actix_web::error::ErrorInternalServerError("")));
                }
            };

            let user = match db::get_session_user(&client, &session_token).await {
                Ok(user) => user,
                Err(_) => {
                    return Ok(req.error_response(actix_web::error::ErrorUnauthorized(
                        "Invalid or expired session",
                    )));
                }
            };

            // Get the singleton group_id
            let group_id_data = req.app_data::<web::Data<i64>>();
            let group_id: i64 = match group_id_data {
                Some(gid) => *gid.get_ref(),
                None => {
                    return Ok(
                        req.error_response(actix_web::error::ErrorInternalServerError(
                            "No group configured",
                        )),
                    );
                }
            };

            // Update last seen (best effort, at most once a minute per user)
            if last_seen.should_write(user.user_id) {
                let _ = db::update_user_last_seen(&client, user.user_id).await;
            }
            // Return the connection to the pool before running the handler, which
            // takes its own. Holding both lets concurrent requests exhaust the
            // pool and wait on each other forever.
            drop(client);

            let session_result = SessionAuthResult { user, group_id };
            req.extensions_mut()
                .insert::<SessionAuthInfo>(Rc::new(session_result));

            // Routes that only need the group take `Authenticated`.
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
    use super::LastSeenThrottle;

    #[test]
    fn last_seen_is_written_once_per_interval_per_user() {
        let throttle = LastSeenThrottle::default();
        assert!(throttle.should_write(1));
        assert!(!throttle.should_write(1));
        assert!(throttle.should_write(2));
    }
}
