import type {NextConfig} from 'next';
const config:NextConfig={
 output:'standalone',
 basePath:process.env.NEXT_PUBLIC_BASE_PATH||'',
 poweredByHeader:false,
 experimental:{cpus:2},
 serverExternalPackages:['node:sqlite'],
};
export default config;
