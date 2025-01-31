#!/bin/bash

npm install @openapitools/openapi-generator-cli

rm *.ts -rf

./node_modules/\@openapitools/openapi-generator-cli/main.js generate \
-g typescript-axios \
--additional-properties=npmName=vrchat \
--git-user-id=vrchatapi \
--git-repo-id=vrchatapi-javascript \
-o . \
-i https://raw.githubusercontent.com/vrchatapi/specification/gh-pages/openapi.yaml \
--http-user-agent="vrchatapi-javascript"

# Modify package.json
sed -i 's/OpenAPI client for vrchat/🟡🔵 VRChat API Library for JavaScript and TypeScript/g' ./package.json
sed -i 's/Unlicense/MIT/g' ./package.json

# Enable global cookies
sed -i '/^import { BASE_PATH/a import axiosCookieJarSupport from "axios-cookiejar-support";axiosCookieJarSupport(globalAxios);import { CookieJar } from "tough-cookie";globalAxios.defaults.jar = new CookieJar();globalAxios.defaults.withCredentials = true;\nlet formData = require("form-data");\ntype File = {\n\tname: string,\n\tdata: Buffer\n}' ./api.ts

sed -i '/"dependencies"/a     "@types/tough-cookie": "^4.0.1",' ./package.json
sed -i '/"dependencies"/a     "axios-cookiejar-support": "^1.0.1",' ./package.json
sed -i '/"dependencies"/a     "tough-cookie": "^4.0.0",' ./package.json
sed -i '/"dependencies"/a     "form-data": "^4.0.1",' ./package.json

sed -i 's/const localVarFormParams = new ((configuration && configuration.formDataCtor) || FormData)();/const localVarFormParams = new formData();/' ./api.ts
sed -i "s/localVarFormParams.append('file', file as any);/localVarFormParams.append('file', file.data, { filename: file.name, contentType: file.name.endsWith('.png') ? 'image\/png' : 'application\/octet-stream' });/" ./api.ts
sed -i 's/localVarRequestOptions.data = localVarFormParams;/localVarRequestOptions.data = localVarFormParams.getBuffer();\nlocalVarRequestOptions.headers = {...localVarHeaderParameter, ...headersFromBaseOptions, ...options.headers, ...localVarFormParams.getHeaders()};/' ./api.ts
# Remove messily pasted markdown at top of every file
for i in *.ts; do
    sed -i '/VRChat API Banner/d' $i
done

npm install
npm run build