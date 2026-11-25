#!/usr/bin/env bash

channels=(
  "Rai 4|746966"
  "Rai 5|395276"
  "Rai Movie|747002"
  "Rai Premium|746992"
  "Rai Gulp|746953"
  "Rai Yoyo|746899"
  "Rai Storia|746990"
  "Rai Sport|358025"
  "Rai Scuola|747011"
)

for channel in "${channels[@]}"; do
  IFS='|' read -r name id <<< "$channel"

  echo
  echo "========================================"
  echo "Testing: $name"
  echo "========================================"

  ffplay -loglevel warning -autoexit \
    -window_title "$name" \
    "https://mediapolis.rai.it/relinker/relinkerServlet.htm?cont=${id}&output=7"

  read -rp "Result (OK / FAIL / other): " result
  echo "$name: $result" >> rai-tests.txt
done

echo
cat rai-tests.txt
