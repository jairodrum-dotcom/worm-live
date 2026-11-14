# WORM LIVE — Multiplayer BETA 0.1

## O que esta entrega já faz
- Servidor autoritativo Node.js + Socket.IO.
- Jogadores reais entram por navegador em uma arena compartilhada.
- Cada cliente recebe sua própria visão/câmera centrada na cobra.
- Movimento por toque/mouse, comida, crescimento e ranking TOP 10.
- Atualizações individuais com filtro de proximidade (interesse local).
- Endpoint protegido para receber eventos de uma ponte externa de LIVE.

## O que ainda NÃO faz
- Não autentica a identidade do TikTok: o nome digitado é apenas um apelido.
- Não recebe curtidas/presentes reais automaticamente.
- Não tem colisão/morte/respawn completos.
- Não está hospedado nem dimensionado para centenas/milhares de pessoas.
- Não deve ser usado em produção sem testes, proteção contra abuso e otimização espacial.

## Rodar localmente
Requer Node.js 20+.
```bash
npm install
ADMIN_TOKEN="defina-um-segredo-forte" npm start
```
Abra http://localhost:3000 em dois ou mais celulares/computadores na mesma rede (para celulares, use o IP local do computador e libere a porta 3000 no firewall).

## Testar evento de presente (simulado)
Com um jogador conectado, descubra o socket ID nos logs/console do navegador ou use o nome que a pessoa digitou:
```bash
curl -X POST http://localhost:3000/api/live-event \
  -H "Authorization: Bearer defina-um-segredo-forte" \
  -H "Content-Type: application/json" \
  -d '{"username":"@Jairo","type":"gift","giftName":"Rosa","growth":50}'
```
Tipos aceitos: `like`, `comment`, `follow`, `gift`. Para o MVP, `growth` é limitado no servidor.

## Caminho para conectar TikTok LIVE
1. Escolher uma ponte/provedor que declare suporte atual a eventos LIVE (likes, follows, comments, gifts) e validar termos, estabilidade e permissões.
2. Rodar essa ponte no servidor, nunca no navegador público.
3. Mapear o username/identificador do evento para o jogador conectado e chamar `POST /api/live-event`.
4. Fazer teste privado com poucos usuários e presentes de baixo valor antes de uma LIVE aberta.

A API pública do TikTok não deve ser presumida como fornecedora irrestrita de eventos de LIVE. Muitas integrações de terceiros usam bibliotecas/protocolos não oficiais; podem quebrar, exigir conta elegível ou ter restrições. Confirmar termos e disponibilidade com o provedor antes de depender dela.

## Arquitetura da BETA
- Browser mobile: HTML Canvas + Socket.IO.
- Game server: Node.js, estado autoritativo, 20 ticks/s.
- Realtime: Socket.IO/WebSocket.
- LIVE bridge: adaptador externo -> endpoint protegido `/api/live-event`.
- Próxima escala: Redis para presença/pub-sub, múltiplas instâncias de zonas, spatial hashing/quadtree, métricas, rate limiting, TLS, autenticação e testes de carga.

## Regras importantes
- Presentes são efeitos/apoio dentro do jogo, não apostas.
- Não prometer prêmio em dinheiro nem converter pontos em dinheiro.
- Exibir aviso de que o jogo é uma experiência externa à LIVE e que nomes digitados não são verificados pelo TikTok.
