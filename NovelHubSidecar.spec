# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_submodules
from PyInstaller.utils.win32.versioninfo import VSVersionInfo, FixedFileInfo, StringFileInfo, StringTable, StringStruct, VarFileInfo, VarStruct
from app.version import __version__

version_tuple = tuple(int(part) for part in __version__.split('.')) + (0,)
version_info = VSVersionInfo(
    ffi=FixedFileInfo(filevers=version_tuple, prodvers=version_tuple, mask=0x3f, flags=0,
                     OS=0x40004, fileType=1, subtype=0, date=(0, 0)),
    kids=[StringFileInfo([StringTable('040904B0', [
        StringStruct('CompanyName', 'Novel Hub'), StringStruct('ProductName', 'Novel Hub'),
        StringStruct('FileDescription', 'Novel Hub Local Service'),
        StringStruct('FileVersion', __version__), StringStruct('ProductVersion', __version__),
        StringStruct('OriginalFilename', 'novelhub-sidecar.exe'),
    ])]), VarFileInfo([VarStruct('Translation', [1033, 1200])])],
)


hiddenimports = collect_submodules("uvicorn")

a = Analysis(
    ["sidecar.py"],
    pathex=["."],
    binaries=[],
    datas=[],
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "boto3",
        "botocore",
        "altair",
        "langchain",
        "langchain_community",
        "matplotlib",
        "numpy",
        "openpyxl",
        "pandas",
        "pyarrow",
        "pygame",
        "psycopg2",
        "pytest",
        "scipy",
        "sqlalchemy",
    ],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="novelhub-sidecar",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    version=version_info,
    icon='web/src-tauri/icons/icon.ico',
)
