###############################################
# Backend Image
###############################################
FROM rustlang/rust:nightly as production-backend

WORKDIR /app

COPY . .

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["cargo", "run", "--release"]
