@echo off
REM ====================================================================
REM  Seyaa backup - double-click this file.
REM  It hands over to install.ps1, which does the whole setup.
REM ====================================================================
title Seyaa backup setup
powershell -NoProfile -ExecutionPolicy Bypass -Command "Unblock-File -LiteralPath '%~dp0install.ps1' -ErrorAction SilentlyContinue; & '%~dp0install.ps1'"
