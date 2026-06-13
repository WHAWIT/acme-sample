import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class AdminTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const token = request.headers['x-acme-admin-token'];
    const expected = process.env.ADMIN_TOKEN;

    if (!expected) {
      if (process.env.NODE_ENV !== 'production') return true;
      throw new UnauthorizedException('Admin token not configured');
    }
    if (token === expected) return true;
    throw new UnauthorizedException('Invalid admin token');
  }
}
