param(
  [Parameter(Mandatory=$true)][string]$LocalFolder,
  [Parameter(Mandatory=$true)][string]$RemotePrefix
)

$bucket = "curriculum"
$endpoint = "https://117eb5dd5e7e556ca8a1b80b972546fa.r2.cloudflarestorage.com"

# Normalize slashes
$LocalFolder = $LocalFolder.TrimEnd('\','/')
$RemotePrefix = $RemotePrefix.Trim('/')

Write-Host "Syncing local folder: $LocalFolder"
Write-Host "To R2 path: s3://$bucket/$RemotePrefix"
Write-Host "Endpoint: $endpoint"

aws s3 sync $LocalFolder "s3://$bucket/$RemotePrefix" --endpoint-url $endpoint
