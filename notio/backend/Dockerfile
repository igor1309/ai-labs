ARG VERSION=dev

# ---- Build stage ----
FROM swift:6.1 AS build

WORKDIR /build
COPY . .
RUN swift build -c release --product NotioServer

# ---- Runtime stage ----
FROM ubuntu:24.04

ARG VERSION
ENV NOTIO_VERSION=${VERSION}
ENV LD_LIBRARY_PATH=/usr/lib/swift/linux

RUN apt-get update && apt-get install -y \
    libstdc++6 \
    libcurl4 \
    libxml2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /usr/lib/swift /usr/lib/swift
COPY --from=build /build/.build/release/NotioServer .

EXPOSE 8080

CMD ["./NotioServer"]
