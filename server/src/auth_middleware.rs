use crate::db;
use actix_web::{
    body::BoxBody,
    dev::{Service, ServiceRequest, ServiceResponse, Transform},
    web, Error, FromRequest, HttpMessage, HttpRequest,
};
use deadpool_postgres::Pool;
use futures::{
    future::{ready, LocalBoxFuture, Ready},
    FutureExt,
};
use std::rc::Rc;

pub struct AuthenticateMiddlewareFactory;
impl AuthenticateMiddlewareFactory {
    pub fn new() -> Self {
        AuthenticateMiddlewareFactory {}
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
        }))
    }
}

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
pub struct AuthenticateMiddleware<S> {
    service: Rc<S>,
}
impl<S, B> Service<ServiceRequest> for AuthenticateMiddleware<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    B: actix_web::body::MessageBody + 'static,
{
    type Response = ServiceResponse<BoxBody>;
    type Error = Error;
    type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;
    actix_service::forward_ready!(service);

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let srv = Rc::clone(&self.service);

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
                        // log::error!("{}", err);
                        return Ok(
                            req.error_response(actix_web::error::ErrorInternalServerError(""))
                        );
                    }
                };

                let group_id = match db::get_group(&client, group_name, token).await {
                    Ok(group) => group,
                    Err(_) => {
                        // log::error!("{}", err);
                        return Ok(req.error_response(actix_web::error::ErrorUnauthorized("")));
                    }
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
