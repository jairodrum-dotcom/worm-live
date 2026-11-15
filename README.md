# WORM LIVE — BETA 0.2 (Visual 3D, Comidas Reais, Crescimento & Sons)

## O que há de novo nesta versão
- **Minhoca 3D Realista:** Corpo composto por segmentos reais interligados com sombreamento esférico 3D, escamas/anéis, brilho especular, olhos que acompanham a direção do movimento e aura neon ao usar boost.
- **Comidas Variadas:** Maçãs, hambúrgueres, donuts, morangos, pizzas e cristais de energia de LIVE com brilho pulsante e rotação suave.
- **Crescimento Real:** Cada comida ou presente do TikTok aumenta fisicamente o comprimento e a espessura da minhoca em tempo real.
- **Efeitos Sonoros Sintetizados (Web Audio API):** Sons de mastigada (pop/chomp), turbo/boost, bônus de presente da LIVE e colisão — sem precisar baixar arquivos MP3 externos.
- **Colisão e Respawn:** Bater no corpo de outra minhoca transforma sua minhoca em comida no mapa e permite renascer instantaneamente.
- **Integração TikTok LIVE (`/api/live-event`):** Suporte completo para `like`, `follow`, `chat` e `gift`.

## Como atualizar no GitHub e Render
1. Extraia todos os arquivos deste ZIP.
2. No seu repositório `worm-live` no GitHub, substitua os arquivos pelos novos (`package.json`, `src/server.js`, `public/index.html`, etc.).
3. Faça o **Commit changes** no GitHub.
4. A **Render** detectará a atualização automaticamente e fará o novo deploy em instantes!
