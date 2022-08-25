function ConvertToWebp {
	Param ($dir)
	# get all files in the directory
	$images = Get-ChildItem -Path $dir -Include *.png

	foreach ($img in $images) {
		$outputName = $img.DirectoryName + "\" + $img.BaseName + ".webp"

		cwebp.exe $img.FullName -o $outputName -lossless -quiet
	}
}

ConvertToWebp -dir ".\public\icons\items\*"
ConvertToWebp -dir ".\public\map\*"