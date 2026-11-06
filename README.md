# CuidaTusFinanzas

PWA personal (Android) de **solo lectura** que muestra la liquidez de hoy y la proyectada a 90 días: indicadores, curva por escenario, calendario del mes, ingresos vs. egresos, liquidez comprometida, compromisos por tarjeta y el snapshot semanal.

## Arquitectura

- **Frontend**: Vite + TypeScript + Preact. Gráfico en SVG propio. Tema claro/oscuro según el sistema.
- **Datos**: Supabase (Postgres). La app **no calcula finanzas**: todo número sale de funciones RPC (`rpc_kpis`, `rpc_forecast`, `rpc_calendario_mes`, `rpc_ingresos_egresos_mes`, `rpc_liquidez_comprometida`, `rpc_compromisos`, `rpc_snapshot_semanal`, `rpc_ajustes`, `rpc_dashboard`). Si una falla, se muestra un error, nunca un valor inventado.
- **PWA**: manifest + service worker que cachea **solo el shell** (HTML, JS, CSS, íconos). Las respuestas de la API nunca se guardan en caché.
- **Publicación**: GitHub Pages con GitHub Actions (`.github/workflows/deploy.yml`), base `/cuidatusfinanzas/`.

## Seguridad

El repo no tiene datos financieros ni secretos. La key de Supabase que figura en el código es la *publishable*, pública por diseño. Los datos los protegen:

1. **Login** con mail y contraseña (no hay registro público).
2. **MFA TOTP obligatorio**: en el primer ingreso se enrola el segundo factor (QR + código); después se pide el código en cada sesión nueva.
3. **RLS y RPC con chequeo de dueño** en la base: solo el usuario dueño puede leer; `anon` no tiene permisos.

## Desarrollo

```bash
npm install
npm test          # tests unitarios del formateo (montos y fechas es-AR)
npm run dev
npm run build
```

Los datos de prueba no están en el repo.
