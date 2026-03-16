@echo off
chcp 65001 >nul
set PROJECT_DIR=%~dp0

:: פתח את תיקיית הפרויקט ב-Explorer
explorer "%PROJECT_DIR%"

:: פתח את CONTEXT.md כדי לראות איפה עצרנו
start "" notepad "%PROJECT_DIR%CONTEXT.md"

:: פתח Claude Code בתיקייה הנכונה
cd /d "%PROJECT_DIR%"
start "" cmd /k "cd /d "%PROJECT_DIR%" && claude"
