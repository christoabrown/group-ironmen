# tip: on windows explorer shift + right-click a directory and copy its path
$dir = ".\public\icons\items\*"

# get all files in the directory
$images = Get-ChildItem -Path $dir -Include *.png

foreach ($img in $images) {
  $outputName = $img.DirectoryName + "\" + $img.BaseName + ".webp"

  cwebp.exe $img.FullName -o $outputName -lossless
}
