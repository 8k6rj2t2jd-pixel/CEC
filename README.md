# Catálogo de Peças

App para fotografar peças de eletrónica automóvel (centralinas, módulos, etc.),
guardar as fotos e registar as referências, fabricante, marca/modelo do
veículo e stock, com leitura automática da etiqueta por OCR.

Há duas versões no mesmo projeto:

- **`server.js` + `public/`** — versão com **login e stock centralizado**,
  acessível de vários telemóveis/computadores em segurança. **Recomendada**
  se mais do que uma pessoa/aparelho vai usar o catálogo, ou se quer que os
  dados não fiquem só num telemóvel. Precisa de um servidor (ver secção de
  hospedagem abaixo).
- **`docs/`** — versão publicada de graça no GitHub Pages, sem servidor
  próprio, com **login com a conta Google** e o catálogo (dados + fotos)
  guardado no **Google Drive** dessa conta — protegido pelo login da própria
  Google, e partilhado entre todos os aparelhos que entrem com essa conta.

## Como funciona (ambas as versões)

Para cada peça tira-se **3 fotos**:

1. **Frente**
2. **Trás**
3. **Etiqueta** (com as referências)

Assim que a foto da etiqueta é tirada, a app já começa a lê-la em segundo
plano (OCR) e tenta preencher sozinha, por altura de rever/guardar a peça:

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
antes de guardar. Há também um catálogo com pesquisa, filtros, controlo de
stock (+/-) e um botão para **transformar o catálogo em Excel** (uma folha
com nome da peça, fabricante, referências, quantidade e foto de cada uma).

### Verificar peça (foto avulsa)

Há um separador extra, **"🔍 Verificar peça"**, para quando já tem uma foto
da etiqueta (tirada agora ou recebida de um cliente, por exemplo pelo
WhatsApp) e só quer saber rapidamente o que fazer com ela — sem passar pelas
3 fotos todas:

1. Carregue ou tire a foto (o seletor do telemóvel dá as duas opções:
   câmara ou galeria/ficheiros).
2. A app lê a etiqueta e procura essa referência no catálogo.
3. Se **já existir**, mostra a peça encontrada com um botão **"+1 ao
   stock"** (soma uma unidade sem mais perguntas) e um atalho para a ver no
   catálogo.
4. Se **não existir**, oferece **"Adicionar como peça nova"** — passa
   diretamente para o formulário de nova peça já com a etiqueta lida (só
   falta fotografar a frente e a trás) — ou **"Procurar no catálogo"**
   manualmente.

---

## Versão com login (`server.js` + `public/`) — recomendada

### O que tem

- **Login obrigatório** (utilizador + senha) para ver ou alterar o catálogo —
  ninguém sem a senha consegue ver o stock ou as fotos.
- Bloqueio automático depois de 5 tentativas de senha erradas seguidas.
- Stock guardado no servidor, acessível a partir de qualquer telemóvel ou
  computador que entre com a senha (não fica preso a um único aparelho).
- Botão **"Transformar catálogo em Excel"** no catálogo, que gera um
  ficheiro `.xlsx` com foto, tipo de peça, fabricante, referências,
  marca/modelo e quantidade de cada peça.
- Espaço para o **logótipo da empresa** — ver secção "Logótipo" abaixo.

### Definir a senha de acesso

A senha nunca fica escrita no código (por segurança) — gera-se uma "hash"
(um código que representa a senha, mas não pode ser lido ao contrário) e
essa hash é que se define no servidor:

```bash
node scripts/set-password.js "a-senha-que-quiser"
```

Isto imprime uma linha `ADMIN_PASSWORD_HASH=...` — copie esse valor, vai
precisar dele já a seguir.

### Pôr a app disponível na internet (hospedagem)

Como esta versão tem um servidor a sério (para o login funcionar de verdade),
precisa de ficar "ligada" nalgum lado — não pode só abrir um ficheiro no
telemóvel. O projeto já inclui um ficheiro `render.yaml` que configura tudo
de uma vez em **[Render](https://render.com)** (plano pago simples com disco
persistente, à volta de 7 USD/mês).

1. Antes de mais, gere a hash da senha de acesso, se ainda não o fez:
   `node scripts/set-password.js "a-senha-que-quiser"` — guarde o resultado
   (`ADMIN_PASSWORD_HASH=...`), vai precisar dele já a seguir.
2. Crie conta em render.com (pode entrar diretamente com o GitHub).
3. **New +** → **Blueprint** → escolha o repositório `CEC` e o branch onde
   está este código. O Render lê o `render.yaml` sozinho e propõe criar o
   serviço com o disco persistente já configurado.
4. Quando pedir os valores em falta, preencha:
   - `ADMIN_USER` → o nome de utilizador que quiser (ex: `admin.CEC`)
   - `ADMIN_PASSWORD_HASH` → o valor gerado no passo 1
   - (o `SESSION_SECRET` é gerado automaticamente, não precisa de mexer)
5. Clique para criar/aplicar o Blueprint. Ao fim de alguns minutos tem um
   link tipo `https://catalogo-pecas.onrender.com`.

Abra esse link no telemóvel (ou em qualquer computador), entre com o
utilizador/senha, e dê permissão de câmara quando pedida.

> Prefere configurar à mão em vez do Blueprint? Também funciona: **New +** →
> **Web Service**, Build Command `npm install`, Start Command `npm start`,
> adicione as variáveis `ADMIN_USER`, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`,
> `NODE_ENV=production` e `DATA_DIR=/data`, e um disco persistente montado em
> `/data`.

> Qualquer outro serviço parecido (Railway, Fly.io, um VPS próprio, etc.)
> funciona da mesma forma — só precisa de correr `npm install` + `npm start`,
> das mesmas variáveis de ambiente, e de um disco que não se apague entre
> reinícios.

### Logótipo

Assim que tiver o ficheiro do logótipo, coloque-o em `public/logo.png`
(tamanho recomendado: altura à volta de 200px, fundo transparente se
possível) — aparece automaticamente no topo da app e na página de login,
sem precisar de mudar mais nada.

### Onde ficam os dados

- `<DATA_DIR>/storage/` — as fotos, organizadas em pastas por fabricante /
  tipo de peça / marca-modelo / id da peça.
- `<DATA_DIR>/pecas.json` — a ficha de cada peça.

Em `localhost` sem configurar `DATA_DIR`, isto fica em `data/` dentro do
projeto. Em produção, `DATA_DIR` deve apontar para o disco persistente (ver
acima).

---

## Versão com Google Drive (`docs/`)

Publicada de graça no GitHub Pages, sem servidor próprio. Em vez de um
utilizador/senha inventado por nós, usa o **login da própria Google** — só
quem tiver a conta Google que autorizar consegue entrar, ponto final, é a
Google a garantir isso. Os dados (fabricante, referências, stock) e as fotos
ficam guardados numa pasta chamada **"CatalogoPecas"** dentro do Google
Drive dessa conta — visível e pesquisável lá normalmente, e já com cópia de
segurança automática (é o próprio Drive).

### Configurar o Google Drive (só precisa de fazer isto uma vez)

1. Vá a **[console.cloud.google.com](https://console.cloud.google.com/)**
   com a conta Google que quer usar para o catálogo, e crie um projeto novo
   (nome sugerido: "Catálogo de Peças").
2. No menu, vá a **APIs & Services → Library**, procure **"Google Drive
   API"** e clique **Enable**.
3. Vá a **APIs & Services → OAuth consent screen**:
   - Tipo de utilizador: **External**.
   - Preencha o nome da app e o seu email (nos campos obrigatórios).
   - Em **Audience** / **Test users**, clique **Add users** e adicione o
     seu próprio email Google — só os emails aqui listados conseguem entrar
     na app, mesmo que alguém descubra o link.
4. Vá a **APIs & Services → Credentials** → **Create Credentials** →
   **OAuth client ID**:
   - Tipo de aplicação: **Web application**.
   - Em **Authorized JavaScript origins**, adicione:
     `https://8k6rj2t2jd-pixel.github.io`
   - Clique **Create**. A Google mostra um **Client ID** (uma linha longa a
     terminar em `.apps.googleusercontent.com`) — copie-o.
5. No repositório, abra `docs/google-config.js` e substitua a linha por:
   ```js
   window.GOOGLE_CLIENT_ID = 'o-client-id-que-copiou.apps.googleusercontent.com';
   ```
   Guarde, faça commit e push.

> A app pede uma permissão bastante restrita (`drive.file`): só consegue ver
> e alterar os ficheiros/pastas que ela própria cria (a pasta
> "CatalogoPecas") — nunca o resto do seu Google Drive.

### Publicar a página no GitHub Pages (só uma vez)

1. No GitHub, abra o repositório e vá a **Settings** → **Pages**.
2. Em "Source", escolha **"Deploy from a branch"**.
3. Em "Branch", escolha o branch onde está este código e a pasta **`/docs`**,
   depois clique **Save**.
4. Ao fim de 1-2 minutos, o GitHub mostra o link da página (algo como
   `https://<o-seu-utilizador>.github.io/<o-nome-do-repositorio>/`).

> Nota: o GitHub só mostra a opção "Pages" em repositórios **privados** se
> tiver um plano pago (Pro). Num repositório privado do plano gratuito, ou
> torna o repositório público (o código fica visível, mas os dados do
> catálogo nunca passam pelo GitHub — ficam só no seu Google Drive), ou usa
> um serviço como o Netlify/Vercel, que publicam repositórios privados de
> graça.

### Usar no telemóvel

1. Abra o link no browser do telemóvel (Chrome no Android, Safari no
   iPhone).
2. Toque em **"Entrar com a conta Google"** e escolha a conta autorizada.
3. Dê permissão de câmara quando for pedida.
4. Opcional: no menu do browser escolha **"Adicionar ao ecrã principal"** —
   fica com um ícone como se fosse uma app instalada.

A primeira vez que usar a leitura da etiqueta, a app descarrega os ficheiros
de OCR (uns 10 MB, uma única vez) — essa parte continua a funcionar sem
internet depois disso, mas ver/guardar peças precisa sempre de internet
(fala com o Google Drive).

### Cópias de segurança

Como os dados já ficam no Google Drive, já têm a segurança normal do Drive
(histórico de versões, não se perdem se limpar o telemóvel). Ainda assim, no
separador **Catálogo** há um botão **"Exportar cópia de segurança"** que
transfere um `.zip` extra com tudo, se preferir guardar uma cópia à parte.

### Logótipo (versão Google Drive)

Coloque o ficheiro em `docs/logo.png` e aparece automaticamente no topo da
app e no ecrã de login.

---

## Estrutura do projeto

```
server.js             servidor Express (login, API, upload, export Excel)
render.yaml           configuração de deploy automático no Render (Blueprint)
lib/store.js          leitura/escrita dos dados das peças
lib/ocr.js            leitura da etiqueta (OCR) e deteção de referências/fabricante
lib/auth.js           login, sessão e bloqueio por tentativas erradas
scripts/set-password.js   gera a hash da senha de acesso
public/               interface da versão com login (inclui public/logo.png)
docs/                 versão com Google Drive (GitHub Pages, inclui docs/logo.png)
docs/google-config.js  o Client ID do Google (preencher, ver secção acima)
docs/auth.js           login com a conta Google (Google Identity Services)
docs/db.js             leitura/escrita das peças e fotos no Google Drive
```

## Limitações conhecidas

- O OCR é uma ajuda, não uma garantia — etiquetas riscadas, desgastadas ou em
  fotos desfocadas podem não ser lidas corretamente. Reveja sempre os campos
  antes de guardar.
- A deteção de fabricante e de tipo de peça baseia-se numa lista de nomes e
  prefixos comuns (Bosch, Denso, Continental, Delphi, Valeo, etc.); pode ser
  facilmente alargada em `lib/ocr.js` (versão com login) ou `docs/app.js`
  (versão telemóvel).
- Na versão com login (servidor), o "utilizador" é único e partilhado (não
  há contas separadas por funcionário) — suficiente para controlar quem
  entra, mas não para distinguir quem fez o quê.
- Na versão `docs/` (Google Drive), ver/guardar peças precisa sempre de
  internet (só a leitura de etiquetas por OCR funciona sem rede). O acesso
  é controlado pela lista de "test users" da Google Cloud Console — para
  autorizar mais pessoas, adicione o email delas lá (ver secção "Configurar
  o Google Drive").
