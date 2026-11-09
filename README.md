# Sveqzz Crosshair

Mira (crosshair) personalizada encima de cualquier juego. **100% gratis.**

- Diseñador con vista previa en vivo: color, largo, grosor, separación, rotación, contorno, punto, círculo o tu propia imagen.
- Comunidad: sube tus crosshairs, vota, guarda y aplica los de otros con un clic.
- Filtros por juego (CS2, Valorant, Fortnite, Rust, Apex, Overwatch) y colecciones (Top Pro, Táctico, Bullet Drop…).
- Varios perfiles y atajos globales.
- Comparte cualquier mira con un código `AF1-…`.

## Descargar
Ve a **[Releases](../../releases/latest)** y baja:
- `SveqzzCrosshair-Setup-x.y.z.exe` — instalador.
- `SveqzzCrosshair-Portable-x.y.z.exe` — se abre sin instalar.

Windows puede mostrar "Editor desconocido": pulsa **Más información → Ejecutar de todas formas**.

## Uso
| Atajo | Acción |
|---|---|
| `Ctrl+Shift+H` | Mostrar / ocultar la mira |
| `Ctrl+Shift+→` / `←` | Perfil siguiente / anterior |

Juega en modo **ventana sin bordes** (borderless). En pantalla completa exclusiva ningún overlay puede dibujarse encima.
La mira es una ventana transparente aparte: no se inyecta en el juego ni lee su memoria.

## Desarrollo
```bash
npm install
npm start        # abrir en modo desarrollo
npm run dist     # generar los .exe en dist/
```
`config.json` define el servidor de comunidad por defecto.
