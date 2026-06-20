#Requires -Version 5.1
<#
  .SYNOPSIS
    Criptografa ou descriptografa o arquivo .env da Neon usando AES-256-GCM.

  .PARAMETER Acao
    "cripitar" para encriptar, "decripitar" para decriptar.

  .PARAMETER Arquivo
    Caminho do arquivo .env (padrao: .env na mesma pasta).

  .PARAMETER Saida
    Caminho do arquivo de saida (padrao: neon_env.enc para cripitar, .env para decripitar).

  .PARAMETER Passphrase
    Senha para criptografia (se omitido, pergunta interativamente).

  .EXAMPLES
    .\cripitar.ps1 -Acao cripitar
    .\cripitar.ps1 -Acao decripitar -Arquivo neon_env.enc -Passphrase "minha_senha"
#>

param(
  [ValidateSet("cripitar","decripitar")]
  [string]$Acao = "cripitar",
  [string]$Arquivo = "",
  [string]$Saida = "",
  [string]$Passphrase = ""
)

$ErrorActionPreference = "Stop"

if (-not $Arquivo) { $Arquivo = if ($Acao -eq "cripitar") { ".env" } else { "neon_env.enc" } }
if (-not $Saida) { $Saida = if ($Acao -eq "cripitar") { "neon_env.enc" } else { ".env" } }
if (-not (Test-Path $Arquivo)) { Write-Host "Arquivo '$Arquivo' nao encontrado!" -ForegroundColor Red; exit 1 }

if (-not $Passphrase) {
  $sec = Read-Host "Digite a senha" -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
  $Passphrase = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  $conf = Read-Host "Confirme a senha" -AsSecureString
  $ptr2 = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($conf)
  $conf2 = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr2)
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr2)
  if ($Passphrase -ne $conf2) { Write-Host "Senhas nao conferem!" -ForegroundColor Red; exit 1 }
}

Write-Host "Carregando $Arquivo ..." -ForegroundColor Gray
$dados = [IO.File]::ReadAllBytes((Resolve-Path $Arquivo))

if ($Acao -eq "cripitar") {
  Write-Host "Criptografando..." -ForegroundColor Yellow
  $algo = [System.Security.Cryptography.Aes]::Create()
  $algo.Mode = [System.Security.Cryptography.CipherMode]::GCM
  $algo.Padding = [System.Security.Cryptography.PaddingMode]::PKCS7
  $algo.KeySize = 256

  $salt = [byte[]]::new(16)
  [Security.Cryptography.RandomNumberGenerator]::Fill($salt)

  $dk = [Security.Cryptography.Rfc2898DeriveBytes]::new($Passphrase, $salt, 600000, [Security.Cryptography.HashAlgorithmName]::SHA256)
  $algo.Key = $dk.GetBytes(32)
  $algo.GenerateIV()

  $enc = $algo.CreateEncryptor()
  $cip = $enc.TransformFinalBlock($dados, 0, $dados.Length)
  $tag = [byte[]]::new(16)
  [Array]::Copy($enc, $enc.Length - 16, $tag, 0, 16)

  $saida = "NEON_ENC`0" + [char]$salt.Length + $salt + [char]$algo.IV.Length + $algo.IV + [char]$tag.Length + $tag + $cip
  [IO.File]::WriteAllBytes($Saida, $saida)
  Write-Host "[OK] Criptografado: $Saida" -ForegroundColor Green
  Write-Host "Nunca compartilhe a senha ou o arquivo .env original!" -ForegroundColor Yellow
} else {
  Write-Host "Descriptografando..." -ForegroundColor Yellow
  $offset = 0
  $magic = [Text.Encoding]::ASCII.GetBytes("NEON_ENC")
  $magicRead = $dados[$offset..($offset+7)]
  $offset += 8
  if (-not ($magicRead -eq $magic)) { Write-Host "Arquivo invalido! (magic)" -ForegroundColor Red; exit 1 }

  $saltLen = $dados[$offset]; $offset++
  $salt = $dados[$offset..($offset+$saltLen-1)]; $offset += $saltLen

  $ivLen = $dados[$offset]; $offset++
  $iv = $dados[$offset..($offset+$ivLen-1)]; $offset += $ivLen

  $tagLen = $dados[$offset]; $offset++
  $tag = $dados[$offset..($offset+$tagLen-1)]; $offset += $tagLen

  $cip = $dados[$offset..($dados.Length-1)]

  $algo = [System.Security.Cryptography.Aes]::Create()
  $algo.Mode = [System.Security.Cryptography.CipherMode]::GCM
  $algo.Padding = [System.Security.Cryptography.PaddingMode]::PKCS7
  $algo.KeySize = 256

  $dk = [Security.Cryptography.Rfc2898DeriveBytes]::new($Passphrase, $salt, 600000, [Security.Cryptography.HashAlgorithmName]::SHA256)
  $algo.Key = $dk.GetBytes(32)
  $algo.IV = $iv

  $dec = $algo.CreateDecryptor()
  $plain = $dec.TransformFinalBlock($cip, 0, $cip.Length)
  [IO.File]::WriteAllBytes($Saida, $plain)
  Write-Host "[OK] Decriptado: $Saida" -ForegroundColor Green
}

Write-Host "Feito!" -ForegroundColor Cyan
