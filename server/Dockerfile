###############################################
# Backend Image
###############################################
FROM rust:1.98-slim-bookworm AS builder
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo build --release --locked

FROM debian:bookworm-slim
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
# A fixed numeric user, so Kubernetes can check runAsNonRoot. The server writes nothing to disk
# (settings come from the environment), so it also runs with a read-only root filesystem.
RUN groupadd --system --gid 10001 server \
    && useradd --system --uid 10001 --gid 10001 --no-create-home --home-dir /nonexistent \
       --shell /usr/sbin/nologin server
COPY --from=builder /app/target/release/server ./
COPY ./docker-entrypoint.sh ./
RUN sed -i 's/\r$//' /app/docker-entrypoint.sh && chmod +x /app/docker-entrypoint.sh

USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["/app/server"]
