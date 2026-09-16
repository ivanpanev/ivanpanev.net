# syntax=docker/dockerfile:1.7
FROM golang:1.27.1-bookworm AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
ARG TARGETARCH
RUN CGO_ENABLED=0 GOOS=linux GOARCH=${TARGETARCH} \
    go build -trimpath -ldflags="-s -w" -o /out/notebook-api ./cmd/notebook-api

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/notebook-api /notebook-api
USER nonroot:nonroot
EXPOSE 8080
ENTRYPOINT ["/notebook-api"]
