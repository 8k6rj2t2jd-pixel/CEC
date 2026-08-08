# Catálogo de Peças

App para fotografar peças de eletrónica automóvel (centralinas, módulos, etc.),
guardar as fotos organizadas em pastas e registar as referências, fabricante,
marca/modelo do veículo e stock, com leitura automática da etiqueta por OCR.

## Como funciona

Para cada peça tira-se **3 fotos**:

1. **Frente**
2. **Trás**
3. **Etiqueta** (com as referências)

Depois de tirar a foto da etiqueta, a app lê o texto automaticamente (OCR) e
tenta preencher sozinha:

- **Fabricante** (ex: Bosch, Denso, Continental, Valeo…) — reconhecido pelo
  nome impresso na etiqueta.
- **Referências** (ex: `0281010438`, `HOM8200066001`) — reconhecidas por
  padrões típicos de referências Bosch e OEM.
- **Tipo de peça** — uma sugestão, quando o prefixo da referência Bosch é
  conhecido (ex: `0281…` → centralina de injeção diesel).

A **marca e modelo do veículo** e o **tipo de peça** ficam sempre à sua
confirmação/edição no formulário, porque normalmente essa informação não vem
impressa na etiqueta da peça (a etiqueta identifica a peça e o fabricante da
peça, não o carro). Todos os campos sugeridos pelo OCR podem ser corrigidos
antes de guardar.

As fotos e os dados de cada peça ficam organizados em pastas por
fabricante / tipo de peça / marca-modelo, e há um catálogo com pesquisa,
filtros e controlo de stock (+/-) por peça.

## Instalar e correr

Requisitos: [Node.js](https://nodejs.org) 18 ou superior.

```bash
npm install
npm start
```

Depois abra `http://localhost:3000` no browser (no telemóvel, mesma rede
Wi-Fi, usando o IP do computador em vez de `localhost`).

> **Nota sobre a câmara:** os browsers só dão acesso à câmara em `localhost`
> ou em ligações HTTPS. Para usar no telemóvel numa rede local sem HTTPS, ou
> use um túnel (ex: `ngrok`, `cloudflared`) ou aceda via `localhost` num
> computador com câmara/webcam.

O OCR (leitura da etiqueta) funciona **offline** — os dados de idioma vêm
incluídos nas dependências instaladas pelo `npm install`, não é preciso
internet depois disso.

## Onde ficam guardados os dados

- `storage/` — as fotos, organizadas em pastas por fabricante / tipo de peça
  / marca-modelo / id da peça.
- `data/pecas.json` — a ficha de cada peça (referências, fabricante, marca,
  modelo, quantidade em stock, notas, caminho das fotos).

Ambas as pastas são criadas automaticamente e ficam fora do controlo de
versões (`.gitignore`). Para fazer uma cópia de segurança, basta copiar as
pastas `storage/` e `data/`.

## Estrutura do projeto

```
server.js       servidor Express (API + upload de fotos)
lib/store.js    leitura/escrita dos dados das peças (data/pecas.json)
lib/ocr.js      leitura da etiqueta (OCR) e deteção de referências/fabricante
public/         interface (captura de fotos, formulário, catálogo)
```

## Limitações conhecidas

- O OCR é uma ajuda, não uma garantia — etiquetas riscadas, desgastadas ou em
  fotos desfocadas podem não ser lidas corretamente. Reveja sempre os campos
  antes de guardar.
- A deteção de fabricante e de tipo de peça baseia-se numa lista de nomes e
  prefixos comuns (Bosch, Denso, Continental, Delphi, Valeo, etc.); pode ser
  facilmente alargada em `lib/ocr.js`.
