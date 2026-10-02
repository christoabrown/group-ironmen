//! The server as a library, for `main.rs` and the integration tests. An item
//! is `pub` only when one of those uses it, or when it is a route handler
//! (actix makes those public whatever they say). Everything else is
//! `pub(crate)`, so that the compiler reports what nothing uses.
pub mod admin_routes;
pub mod api;
pub mod auth_middleware;
pub mod auth_routes;
pub mod authed;
pub mod config;
pub mod db;
pub mod discord_routes;
pub mod error;
pub mod health;
mod http;
pub mod hub;
pub mod models;
pub mod osrs;
pub mod unauthed;
pub mod update_batcher;
pub mod validators;
