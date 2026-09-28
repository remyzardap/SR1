# Sutaeru Domain & SSL Setup

## Domain Configuration

### Namecheap DNS Records

| Type | Host | Value | TTL |
|------|------|-------|-----|
| A Record | `@` | `157.15.40.34` | Automatic |
| A Record | `www` | `157.15.40.34` | Automatic |

### Steps to Add in Namecheap:

1. Login: https://www.namecheap.com
2. Go to: Domain List → Manage (sutaeru.com)
3. Click: Advanced DNS tab
4. Click: Add New Record
5. Add both A records above
6. Save All Changes

## SSL Certificate

✅ **Automatic via Let's Encrypt**

Traefik (Coolify proxy) will automatically:
- Detect when DNS propagates
- Request SSL certificate from Let's Encrypt
- Enable HTTPS for sutaeru.com

**Timeline:** 5-30 minutes after DNS records are added

## Email Configuration

### Option 1: Email Forwarding to Gmail (Recommended)

1. In Namecheap: Go to Domain → Email Forwarding
2. Add: `*@sutaeru.com` → `zardremyap@gmail.com`
3. Save

### Option 2: Google Workspace

1. Sign up: https://workspace.google.com
2. Verify domain ownership
3. Add MX records in Namecheap:
   - `ASPMX.L.GOOGLE.COM.` (Priority 1)
   - `ALT1.ASPMX.L.GOOGLE.COM.` (Priority 5)
   - `ALT2.ASPMX.L.GOOGLE.COM.` (Priority 5)
   - `ALT3.ASPMX.L.GOOGLE.COM.` (Priority 10)
   - `ALT4.ASPMX.L.GOOGLE.COM.` (Priority 10)

## Verification

After DNS propagation (5-30 mins):

```bash
# Check DNS
dig sutaeru.com A

# Check HTTPS
curl -I https://sutaeru.com
```

## URLs After Setup

| URL | Status |
|-----|--------|
| https://sutaeru.com | ✅ Main app |
| https://www.sutaeru.com | ✅ Redirects to main |
| http://sutaeru.com | ✅ Redirects to HTTPS |

## Troubleshooting

### If SSL doesn't work:
1. Check DNS: `dig sutaeru.com A`
2. Check Traefik logs: `sudo docker logs coolify-proxy`
3. Verify labels: `sudo docker inspect sutaeru | grep traefik`

### If site doesn't load:
1. Check Sutaeru: `sudo docker logs sutaeru`
2. Check Traefik: `sudo docker ps | grep proxy`
3. Verify port: `curl http://localhost:5000`
