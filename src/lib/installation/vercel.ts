import 'server-only';
import {appJwt} from '@/lib/github/app-jwt';
import {vercelGateway as gateway} from './vercel-api';
/** Sunucuda: GitHub uygulamasının JWT'si `@octokit/auth-app` ile yerelde imzalanır. */
export function vercelGateway(token:string){return gateway(token,appJwt);}
