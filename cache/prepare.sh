echo "Copying cache files"

echo "Downloading xteas.json"
id=$(curl -s https://archive.openrs2.org/caches.json | jq -r '[.[] | select(.game=="oldschool" and .environment=="live" and .language=="en" and (.sources | contains(["Jagex"]))) | .id] | max')

curl -o cache/xteas.json https://archive.openrs2.org/caches/runescape/$id/keys.json
curl -o cache/disk.zip https://archive.openrs2.org/caches/runescape/$id/disk.zip
unzip cache/disk.zip -d cache
