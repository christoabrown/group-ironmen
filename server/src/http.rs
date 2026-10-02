//! Requests to the services other than the hub (Discord, the wiki's prices).
//! They share one agent, so that each of them gives up after a while and
//! says who is asking.
use crate::error::ApiError;
use std::sync::OnceLock;
use std::time::Duration;

pub(crate) const USER_AGENT: &str = "ha-osrs-map (github.com/RedFirebreak/ha-osrs-map)";
/// How long a service may take to answer.
const TIMEOUT: Duration = Duration::from_secs(10);

fn agent() -> &'static ureq::Agent {
    static AGENT: OnceLock<ureq::Agent> = OnceLock::new();
    AGENT.get_or_init(|| {
        ureq::Agent::config_builder()
            .timeout_global(Some(TIMEOUT))
            .user_agent(USER_AGENT)
            .build()
            .new_agent()
    })
}

/// Runs a request, which blocks, where it doesn't hold up the async threads.
pub(crate) async fn blocking<T, F>(request: F) -> Result<T, ApiError>
where
    T: Send + 'static,
    F: FnOnce(&ureq::Agent) -> Result<T, ApiError> + Send + 'static,
{
    tokio::task::spawn_blocking(move || request(agent()))
        .await
        .map_err(|err| ApiError::UreqError(ureq::Error::Io(std::io::Error::other(err))))?
}
