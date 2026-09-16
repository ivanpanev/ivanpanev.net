package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/ivanpanev/ivanpanev.net/apps/notebook-api/internal/api"
	"github.com/ivanpanev/ivanpanev.net/apps/notebook-api/internal/config"
	"github.com/ivanpanev/ivanpanev.net/apps/notebook-api/internal/migrate"
	"github.com/ivanpanev/ivanpanev.net/apps/notebook-api/internal/store"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.37.0"
)

func main() {
	os.Exit(run())
}

func run() int {
	boot := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	cfg, err := config.FromEnv()
	if err != nil {
		boot.Error("config", "err", err)
		return 1
	}
	var lvl slog.Level
	if err := lvl.UnmarshalText([]byte(cfg.LogLevel)); err != nil {
		lvl = slog.LevelInfo
	}
	log := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: lvl}))
	slog.SetDefault(log)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	if err := retry(ctx, 8, time.Second, func() error { return migrate.UpURL(ctx, cfg.DatabaseURL) }); err != nil {
		log.Error("migrate", "err", err)
		return 1
	}

	var pg *store.Postgres
	if err := retry(ctx, 8, time.Second, func() error {
		var e error
		pg, e = store.NewPostgres(ctx, cfg.DatabaseURL)
		return e
	}); err != nil {
		log.Error("postgres", "err", err)
		return 1
	}
	defer pg.Close()

	shutdownTracer, err := setupTracer(ctx, cfg.OTLPEndpoint)
	if err != nil {
		log.Error("otel", "err", err)
		return 1
	}
	defer func() { _ = shutdownTracer(context.Background()) }()

	srvAPI := api.New(cfg, pg, log, pg.Ping)
	go srvAPI.SweepLoop(ctx)

	httpSrv := &http.Server{
		Addr:              cfg.ListenAddr,
		Handler:           srvAPI.Handler(),
		ReadHeaderTimeout: cfg.ReadHeaderTimeout,
		ReadTimeout:       60 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       90 * time.Second,
	}
	errCh := make(chan error, 1)
	go func() {
		log.Info("listen", "addr", cfg.ListenAddr)
		errCh <- httpSrv.ListenAndServe()
	}()

	select {
	case <-ctx.Done():
	case err := <-errCh:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Error("http", "err", err)
			return 1
		}
	}

	shutCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := httpSrv.Shutdown(shutCtx); err != nil {
		log.Error("shutdown", "err", err)
		return 1
	}
	return 0
}

func setupTracer(ctx context.Context, endpoint string) (func(context.Context) error, error) {
	if endpoint == "" {
		return func(context.Context) error { return nil }, nil
	}
	exp, err := otlptracehttp.New(ctx, otlptracehttp.WithEndpoint(endpoint), otlptracehttp.WithInsecure())
	if err != nil {
		return nil, err
	}
	res, err := resource.Merge(resource.Default(), resource.NewWithAttributes(
		semconv.SchemaURL,
		semconv.ServiceName("notebook-api"),
	))
	if err != nil {
		return nil, err
	}
	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exp),
		sdktrace.WithResource(res),
	)
	otel.SetTracerProvider(tp)
	return tp.Shutdown, nil
}

func retry(ctx context.Context, attempts int, wait time.Duration, fn func() error) error {
	var err error
	for i := 0; i < attempts; i++ {
		err = fn()
		if err == nil {
			return nil
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(wait):
		}
		wait *= 2
	}
	return err
}
