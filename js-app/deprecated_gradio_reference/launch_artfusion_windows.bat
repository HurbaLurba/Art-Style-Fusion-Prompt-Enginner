@echo off
set "CONDA_ENV_NAME=art-style-fusion"
set "PYTHON_SCRIPT=gradio-app.py"
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"
echo Activating Conda environment...
call conda activate %CONDA_ENV_NAME%
echo Running Python script...
call python "%SCRIPT_DIR%%PYTHON_SCRIPT%"
pause
