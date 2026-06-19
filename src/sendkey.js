const { execSync } = require("child_process")
const fs = require("fs")
const path = require("path")
const os = require("os")

const CS_PATH = path.join(os.tmpdir(), "neon_keys.cs")
const CS_CODE = `
using System; using System.Runtime.InteropServices;
public class NeonKeys {
    [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
    public static void Press(byte vk) { keybd_event(vk,0,0,UIntPtr.Zero); keybd_event(vk,0,2,UIntPtr.Zero); }
    public static void Mute() { for(int i=0;i<50;i++){Press(0xAD);} }
    public static void MaxVol() { for(int i=0;i<50;i++){Press(0xAF);} }
    public static void VolDown() { Press(0xAE); }
    public static void SetVol(int t) { Mute(); MaxVol(); for(int i=0;i<50-(t/2);i++){VolDown();} }
}
`

function ps(comando) {
  return execSync(`powershell -NoProfile -Command "Add-Type -Path '${CS_PATH}'; ${comando}"`, { timeout: 10000, windowsHide: true, encoding: "utf8" })
}

if (!fs.existsSync(CS_PATH)) {
  fs.writeFileSync(CS_PATH, CS_CODE, "utf8")
}

const VK = { NEXT: 0xB0, PREV: 0xB1, PLAY_PAUSE: 0xB3 }

function send(vkCode) {
  try { ps(`[NeonKeys]::Press(${vkCode})`); return true }
  catch { return false }
}

function volume(level) {
  try { ps(`[NeonKeys]::SetVol(${Math.min(100,Math.max(0,level))})`); return true }
  catch { return false }
}

function focusJanela(titulo) {
  try {
    execSync(`powershell -NoProfile -Command "$wshell=New-Object -ComObject WScript.Shell; $wshell.AppActivate('${titulo}')"`, { timeout: 5000, windowsHide: true })
    return true
  } catch { return false }
}

function sendKey(char) {
  try {
    focusJanela("Opera")
    execSync(`powershell -NoProfile -Command "$wshell=New-Object -ComObject WScript.Shell; Start-Sleep -Milliseconds 300; $wshell.SendKeys('${char}')"`, { timeout: 5000, windowsHide: true })
    return true
  } catch { return false }
}

module.exports = { send, volume, focusJanela, sendKey, VK }