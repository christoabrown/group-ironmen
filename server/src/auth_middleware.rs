//! Who is asking. A request carries the `session` cookie it got when someone
//! signed in (see `discord_routes`); the session says who they are and whether
//! the hub calls them an admin (see `hub::members`).
use crate::db;
use crate::models::Session;
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
use std::rc::Rc;

pub const SESSION_COOKIE: &str = "session";

type SessionInfo = Rc<Session>;

/// Someone who is signed in.
pub struct Authenticated(SessionInfo);
impl std::ops::Deref for Authenticated {
    type Target = Session;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}
impl FromRequest for Authenticated {
    type Error = Error;
    type Future = Ready<Result<Self, Self::Error>>;

    fn from_request(req: &HttpRequest, _payload: &mut actix_web::dev::Payload) -> Self::Future {
        let session = req.extensions().get::<SessionInfo>().cloned();
        ready(match session {
            Some(session) => Ok(Authenticated(session)),
            None => Err(actix_web::error::ErrorUnauthorized("Not authenticated")),
        })
    }
}

/// Someone who is signed in and an admin on the hub.
pub struct AdminAuthenticated(SessionInfo);
impl std::ops::Deref for AdminAuthenticated {
    type Target = Session;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}
impl FromRequest for AdminAuthenticated {
    type Error = Error;
    type Future = Ready<Result<Self, Self::Error>>;

    fn from_request(req: &HttpRequest, _payload: &mut actix_web::dev::Payload) -> Self::Future {
        let session = req.extensions().get::<SessionInfo>().cloned();
        ready(match session {
            Some(session) if session.is_admin => Ok(AdminAuthenticated(session)),
            Some(_) => Err(actix_web::error::ErrorForbidden("Admin access required")),
            None => Err(actix_web::error::ErrorUnauthorized("Not authenticated")),
        })
    }
}

/// Lets a request through when its session cookie names a session.
pub struct SessionMiddlewareFactory;
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
            let Some(cookie) = req.cookie(SESSION_COOKIE) else {
                return Ok(
                    req.error_response(actix_web::error::ErrorUnauthorized("Not authenticated"))
                );
            };

            let Some(db_pool) = req.app_data::<web::Data<Pool>>() else {
                return Ok(req.error_response(actix_web::error::ErrorInternalServerError("")));
            };
            let Ok(client) = db_pool.get().await else {
                return Ok(req.error_response(actix_web::error::ErrorInternalServerError("")));
            };
            let session = db::get_session(&client, cookie.value()).await;
            // Return the connection to the pool before running the handler, which
            // takes its own. Holding both lets concurrent requests exhaust the
            // pool and wait on each other forever.
            drop(client);

            let Ok(session) = session else {
                return Ok(req.error_response(actix_web::error::ErrorUnauthorized(
                    "Invalid or expired session",
                )));
            };
            req.extensions_mut().insert::<SessionInfo>(Rc::new(session));

            let res = srv.call(req).await?;
            Ok(res.map_into_boxed_body())
        }
        .boxed_local()
    }
}
