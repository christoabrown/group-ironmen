use actix_web::{HttpResponse, ResponseError};
use deadpool_postgres::PoolError;
use derive_more::{Display, From};

#[allow(clippy::enum_variant_names)]
#[derive(Debug, Display, From)]
pub enum ApiError {
    PoolError(PoolError),
    PGError(tokio_postgres::error::Error),
    SerdeJsonError(serde_json::Error),
    #[from(ignore)]
    GetGroupDataError(tokio_postgres::error::Error),
    #[from(ignore)]
    DeleteGroupMemberError(tokio_postgres::error::Error),
    #[from(ignore)]
    GetSkillsDataError(tokio_postgres::error::Error),
    UreqError(ureq::Error),
    #[display("Hub error: {}", _0)]
    #[from(ignore)]
    HubError(String),
    #[display("Unauthorized")]
    #[from(ignore)]
    Unauthorized,
    #[display("Bad request: {}", _0)]
    #[from(ignore)]
    BadRequest(String),
}
impl std::error::Error for ApiError {}
fn handle_pg_error(err: &tokio_postgres::error::Error, name: &str) -> HttpResponse {
    match err.as_db_error() {
        Some(db_error) => log::error!("{}: {}", name, db_error.message()),
        None => log::error!("{}: {}", name, err),
    };

    HttpResponse::InternalServerError().finish()
}
impl ResponseError for ApiError {
    fn error_response(&self) -> HttpResponse {
        match *self {
            ApiError::PoolError(ref err) => {
                log::error!("PoolError: {}", err);
                HttpResponse::InternalServerError().body(format!("PoolError: {}", err))
            }
            ApiError::PGError(ref err) => handle_pg_error(err, "PGError"),
            ApiError::GetGroupDataError(ref err) => handle_pg_error(err, "GetGroupDataError"),
            ApiError::GetSkillsDataError(ref err) => handle_pg_error(err, "GetSkillsDataError"),
            ApiError::DeleteGroupMemberError(ref err) => {
                handle_pg_error(err, "DeleteGroupMemberError")
            }
            ApiError::SerdeJsonError(ref err) => {
                log::error!("SerdeJsonError: {}", err);
                HttpResponse::InternalServerError().body(format!("SerdeJsonError: {}", err))
            }
            ApiError::UreqError(ref err) => {
                log::error!("UreqError: {}", err);
                HttpResponse::InternalServerError().body(format!("UreqError: {}", err))
            }
            ApiError::HubError(ref err) => {
                log::warn!("HubError: {}", err);
                HttpResponse::ServiceUnavailable()
                    .insert_header(("Retry-After", "10"))
                    .body("The data hub is currently unavailable")
            }
            ApiError::Unauthorized => HttpResponse::Unauthorized().body("Unauthorized"),
            ApiError::BadRequest(ref msg) => HttpResponse::BadRequest().body(msg.clone()),
        }
    }
}
