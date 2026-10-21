"""Inspect the produced APK without a connected device."""
from pathlib import Path
import hashlib
import json
import struct
import subprocess
import zipfile

root = Path(__file__).resolve().parents[1]
apk = root / 'artifacts/tranSSlater-arm64.apk'
with zipfile.ZipFile(apk) as archive:
    assert archive.testzip() is None, 'APK ZIP integrity failed'
    dex = b''.join(archive.read(name) for name in archive.namelist() if name.endswith('.dex'))
    assert b'Lcom/transslater/app/ExternalInputPlugin;' in dex, 'Release shrinking removed the native input plugin'
    assert b'Lcom/transslater/app/TranslationNetworkPlugin;' in dex, 'Release shrinking removed the Android network plugin'
    assert b'Lcom/transslater/app/TranslationRequest;' in dex, 'Release shrinking removed the Android network request model'
    libraries = [item for item in archive.infolist() if item.filename.endswith('.so')]
    assert libraries and all('/arm64-v8a/' in item.filename for item in libraries), 'Unexpected APK ABI'
    results = []
    for entry in libraries:
        binary = archive.read(entry)
        assert binary[:5] == b'\x7fELF\x02', 'Not a 64-bit ELF'
        assert struct.unpack_from('<H', binary, 18)[0] == 183, 'Not an AArch64 ELF'
        phoff = struct.unpack_from('<Q', binary, 32)[0]
        phsize, phcount = struct.unpack_from('<HH', binary, 54)
        loads = [struct.unpack_from('<IIQQQQQQ', binary, phoff + i * phsize) for i in range(phcount)]
        alignments = [header[7] for header in loads if header[0] == 1]
        assert alignments and min(alignments) >= 16384, 'ELF lacks 16 KiB page alignment'
        with apk.open('rb') as stream:
            stream.seek(entry.header_offset + 26)
            name_len, extra_len = struct.unpack('<HH', stream.read(4))
        data_offset = entry.header_offset + 30 + name_len + extra_len
        if entry.compress_type == zipfile.ZIP_STORED:
            assert data_offset % 16384 == 0, 'Stored native library is not ZIP-aligned to 16 KiB'
        results.append({'path': entry.filename, 'bytes': len(binary), 'loadAlignments': alignments, 'zipDataOffset': data_offset})

config = json.loads((root / 'tools.local.json').read_text(encoding='utf-8-sig'))
build_tools = Path(config['androidSdk']) / 'build-tools'
aapt = max(build_tools.glob('*/aapt.exe'), key=lambda p: tuple(int(part) for part in p.parent.name.split('.')))
def inspect(*args):
    return subprocess.check_output([str(aapt), 'dump', *args], encoding='utf-8', errors='replace')
badging = inspect('badging', str(apk))
manifest = inspect('xmltree', str(apk), 'AndroidManifest.xml')
app_config = json.loads((root / 'src-tauri/tauri.conf.json').read_text(encoding='utf-8-sig'))
version_code = app_config['bundle']['android']['versionCode']
assert f"name='com.transslater.app' versionCode='{version_code}'" in badging, 'Incorrect application identity or upgrade version'
actions = ['android.intent.action.PROCESS_TEXT', 'android.intent.action.SEND', 'android.intent.action.VIEW']
assert all(action in manifest for action in actions), 'An Android external input entry is missing'
assert 'android.permission.SYSTEM_ALERT_WINDOW' not in manifest and 'android.permission.MANAGE_EXTERNAL_STORAGE' not in manifest
report = {'apk': apk.name, 'bytes': apk.stat().st_size, 'sha256': hashlib.sha256(apk.read_bytes()).hexdigest(), 'abi': 'arm64-v8a', 'package': 'com.transslater.app', 'versionCode': version_code, 'externalInputActions': actions, 'nativeInputPlugin': 'retained in release DEX', 'nativeNetworkPlugin': 'retained in release DEX', 'libraries': results, 'zipIntegrity': 'passed', 'nativePageAlignment': 'passed', 'deviceLaunch': 'not run: no device or emulator connected'}
(root / 'artifacts/verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report, ensure_ascii=False, indent=2))
