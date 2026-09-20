package main

import "context"

// App 桌面宿主：当前仅生命周期钩子；模型路径注入等经 Bind 方法暴露给前端（按需增）
type App struct {
	ctx context.Context
}

func NewApp() *App { return &App{} }

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// Version 返回宿主版本（前端可显示；预留）
func (a *App) Version() string { return "0.1.0" }
