import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, errors as joseErrors } from 'jose';
import type { Principal } from './principal';

@Injectable()
export class SupabaseAuthService {
  private readonly supabaseUrl: string;
  private readonly publishableKey: string;
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly issuer: string;
  private readonly audience: string;

  constructor(private readonly configService: ConfigService) {
    this.supabaseUrl = this.configService.getOrThrow<string>('SUPABASE_URL');
    this.publishableKey = this.configService.getOrThrow<string>('SUPABASE_PUBLISHABLE_KEY');

    const jwksUrl = new URL(`${this.supabaseUrl}/auth/v1/.well-known/jwks.json`);
    this.jwks = createRemoteJWKSet(jwksUrl);

    this.issuer =
      this.configService.get<string>('SUPABASE_JWT_ISSUER') ?? `${this.supabaseUrl}/auth/v1`;
    this.audience = this.configService.get<string>('SUPABASE_JWT_AUDIENCE') ?? 'authenticated';
  }

  async verifyToken(token: string): Promise<Principal> {
    // 1. Attempt asymmetric JWKS verification.
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        audience: this.audience,
      });
      this.validateClaims(payload);
      return this.createPrincipal(payload);
    } catch (err) {
      if (!(err instanceof joseErrors.JWKSNoMatchingKey)) {
        throw err;
      }
    }

    // 2. JWKS has no asymmetric key — likely legacy HS256 local Supabase.
    //    Verify via the pinned /auth/v1/user endpoint.
    return this.verifyViaUserEndpoint(token);
  }

  private async verifyViaUserEndpoint(token: string): Promise<Principal> {
    const response = await fetch(`${this.supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: this.publishableKey,
      },
    });

    if (!response.ok) {
      throw new UnauthorizedException('Token verification failed');
    }

    const user = (await response.json()) as {
      id: string;
      email: string;
      role?: string;
      aud?: string;
    };

    if (!user.id || !isUuid(user.id)) {
      throw new UnauthorizedException('Invalid user response from auth endpoint');
    }
    if (user.role !== 'authenticated') {
      throw new UnauthorizedException('Invalid role from auth endpoint');
    }
    if (user.aud !== 'authenticated') {
      throw new UnauthorizedException('Invalid audience from auth endpoint');
    }

    return {
      sub: user.id,
      email: user.email ?? '',
      role: user.role,
      aud: user.aud,
    };
  }

  private validateClaims(payload: Record<string, unknown>): void {
    if (payload.aud !== 'authenticated') {
      throw new UnauthorizedException('Token audience must be authenticated');
    }
    if (payload.role !== 'authenticated') {
      throw new UnauthorizedException('Token role must be authenticated');
    }
    if (typeof payload.sub !== 'string' || !payload.sub) {
      throw new UnauthorizedException('Token subject is missing or invalid');
    }
  }

  private createPrincipal(payload: Record<string, unknown>): Principal {
    return {
      sub: payload.sub as string,
      email: (payload.email as string) ?? '',
      role: (payload.role as string) ?? 'authenticated',
      aud: (payload.aud as string) ?? 'authenticated',
    };
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
