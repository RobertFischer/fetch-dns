#!/bin/bash

set -o pipefail
set -exu

for SERVER in 'https://dns.google.com/resolve' 'https://cloudflare-dns.com/dns-query'
do
	echo "Testing out the server: $SERVER"
	curl "$SERVER?name=google.com&type=A" -i -v --header "Accept: application/dns-json"
done
