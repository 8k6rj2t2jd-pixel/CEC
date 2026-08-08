# Catálogo de Peças

App para fotografar peças de eletrónica automóvel (centralinas, módulos, etc.),
guardar as fotos e registar as referências, fabricante, marca/modelo do
veículo e stock, com leitura automática da etiqueta por OCR.

Há duas versões no mesmo projeto:

- **`docs/`** — versão para usar diretamente no **telemóvel**, sem instalar
  nada (nem Node, nem programas). É a versão recomendada para o dia a dia.
- **`server.js` + `public/`** — versão que corre num computador com Node.js,
  útil se preferir guardar as fotos como ficheiros normais numa pasta do PC.

## Como funciona (as duas versões)

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
antes de guardar. Há também um catálogo com pesquisa, filtros e controlo de
stock (+/-) por peça.

---

## Versão para telemóvel (`docs/`) — recomendada

Esta versão fica publicada como uma página web através do **GitHub Pages**
(gratuito, já incluído no seu repositório) e usa-se diretamente no browser do
telemóvel — não instala nada. As fotos e os dados ficam guardados dentro do
próprio telemóvel/browser (não vão para nenhum servidor nem para a internet).

### Publicar a página (só precisa de fazer isto uma vez)

1. No GitHub, abra o repositório e vá a **Settings** → **Pages**.
2. Em "Source", escolha **"Deploy from a branch"**.
3. Em "Branch", escolha o branch onde está este código e a pasta **`/docs`**,
   depois clique **Save**.
4. Ao fim de 1-2 minutos, o GitHub mostra o link da página (algo como
   `https://<o-seu-utilizador>.github.io/<o-nome-do-repositorio>/`).

### Usar no telemóvel

1. Abra esse link no browser do telemóvel (Chrome no Android, Safari no
   iPhone).
2. Dê permissão de câmara quando for pedida.
3. Opcional: no menu do browser escolha **"Adicionar ao ecrã principal"** —
   fica com um ícone como se fosse uma app instalada.

A primeira vez que usar a leitura da etiqueta, a app descarrega os ficheiros
de OCR (uns 10 MB, uma única vez) — depois disso funciona sem internet.

### Cópias de segurança

No separador **Catálogo** há um botão **"Exportar cópia de segurança"** que
transfere um ficheiro `.zip` com todas as fotos e os dados de todas as peças,
organizados em pastas por fabricante/tipo/marca-modelo. Como os dados ficam
só no telemóvel, é importante exportar esta cópia de vez em quando (ex: uma
vez por semana) e guardá-la nalgum lado (email, Drive, computador).

> **Importante:** use sempre o mesmo telemóvel e o mesmo browser para não
> "perder de vista" peças guardadas — cada browser/telemóvel tem o seu
> próprio catálogo. Se limpar os dados do browser (histórico/cache) sem
> exportar primeiro, perde as peças guardadas.

---

## Versão para computador com Node.js (`server.js` + `public/`)

Alternativa para quem prefere que as fotos fiquem como ficheiros normais
numa pasta do computador (mais fácil de gerir com outros programas, backups
automáticos, etc.), em vez de dentro do browser do telemóvel.

Requisitos: [Node.js](https://nodejs.org) 18 ou superior.

```bash
npm install
npm start
```

Depois abra `http://localhost:3000` no browser (no telemóvel, mesma rede
Wi-Fi, usando o IP do computador em vez de `localhost` — note que a câmara só
funciona em `localhost` ou HTTPS, por isso aceder de outro aparelho pode
exigir um túnel como `ngrok`).

Onde ficam os dados:

- `storage/` — as fotos, organizadas em pastas por fabricante / tipo de peça
  / marca-modelo / id da peça.
- `data/pecas.json` — a ficha de cada peça.

Ambas as pastas são criadas automaticamente e ficam fora do controlo de
versões (`.gitignore`). Para fazer uma cópia de segurança, basta copiar as
pastas `storage/` e `data/`.

---

## Estrutura do projeto

```
docs/           versão para telemóvel (GitHub Pages), sem instalação
server.js       servidor Express da versão para computador (API + upload)
lib/store.js    leitura/escrita dos dados das peças (data/pecas.json)
lib/ocr.js      leitura da etiqueta (OCR) e deteção de referências/fabricante
public/         interface da versão para computador
```

## Limitações conhecidas

- O OCR é uma ajuda, não uma garantia — etiquetas riscadas, desgastadas ou em
  fotos desfocadas podem não ser lidas corretamente. Reveja sempre os campos
  antes de guardar.
- A deteção de fabricante e de tipo de peça baseia-se numa lista de nomes e
  prefixos comuns (Bosch, Denso, Continental, Delphi, Valeo, etc.); pode ser
  facilmente alargada em `lib/ocr.js` (versão computador) ou `docs/app.js`
  (versão telemóvel).
- Na versão para telemóvel, os dados ficam guardados só naquele
  telemóvel/browser — exporte cópias de segurança regularmente.
