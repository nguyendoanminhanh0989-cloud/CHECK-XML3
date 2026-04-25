@echo off
color 0A
echo =======================================================
echo     CONG CU TRIEN KHAI TU DONG LEN VERCEL ^& SUPABASE
echo =======================================================
echo.
echo [1] Dang cai dat Vercel CLI...
call npm install -g vercel >nul 2>&1
echo [OK] Da cai dat Vercel.
echo.
echo [2] Tien hanh Day code len Vercel...
echo *** LUU Y: Neu ban thay cac cau hoi tieng Anh hien ra, hay cu bam phim ENTER lien tuc nhe! ***
echo.
call vercel
echo.
echo [Hoan Thanh] Neu deploy thanh cong, Link cua Web da duoc hien thi o tren (Production URL).
pause
