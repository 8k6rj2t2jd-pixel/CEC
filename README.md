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
- **`docs/`** — versão simples para um único telemóvel, publicada de graça no
  GitHub Pages, sem servidor nem login (os dados ficam só nesse telemóvel).
  Mais simples, mas sem proteção por senha nem partilha entre aparelhos.

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

## Versão simples para um telemóvel (`docs/`)

Sem servidor, sem login, publicada de graça no GitHub Pages — ver
instruções completas mais abaixo. Boa opção se for só uma pessoa a usar,
num único telemóvel, e não precisar de senha.

### Publicar a página (só precisa de fazer isto uma vez)

1. No GitHub, abra o repositório e vá a **Settings** → **Pages**.
2. Em "Source", escolha **"Deploy from a branch"**.
3. Em "Branch", escolha o branch onde está este código e a pasta **`/docs`**,
   depois clique **Save**.
4. Ao fim de 1-2 minutos, o GitHub mostra o link da página (algo como
   `https://<o-seu-utilizador>.github.io/<o-nome-do-repositorio>/`).

> Nota: o GitHub só mostra a opção "Pages" em repositórios **privados** se
> tiver um plano pago (Pro). Num repositório privado do plano gratuito, ou
> torna o repositório público (o código fica visível, mas as fotos/stock
> nunca passam pelo GitHub — ficam só no telemóvel), ou usa um serviço como
> o Netlify/Vercel, que publicam repositórios privados de graça.

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
transfere um ficheiro `.zip` com todas as fotos e os dados de todas as peças.
Como os dados ficam só no telemóvel, exporte esta cópia de vez em quando
(ex: uma vez por semana) e guarde-a nalgum lado (email, Drive, computador).

> **Importante:** use sempre o mesmo telemóvel e o mesmo browser — cada
> browser/telemóvel tem o seu próprio catálogo, e limpar os dados do browser
> sem exportar primeiro perde as peças guardadas. Esta versão não tem senha
> nem login: qualquer pessoa com acesso físico ao telemóvel desbloqueado
> consegue abrir a app.

### Logótipo (versão telemóvel)

Coloque o ficheiro em `docs/logo.png` e aparece automaticamente no topo da
app.

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
docs/                 versão simples para telemóvel (GitHub Pages, inclui docs/logo.png)
```

## Limitações conhecidas

- O OCR é uma ajuda, não uma garantia — etiquetas riscadas, desgastadas ou em
  fotos desfocadas podem não ser lidas corretamente. Reveja sempre os campos
  antes de guardar.
- A deteção de fabricante e de tipo de peça baseia-se numa lista de nomes e
  prefixos comuns (Bosch, Denso, Continental, Delphi, Valeo, etc.); pode ser
  facilmente alargada em `lib/ocr.js` (versão com login) ou `docs/app.js`
  (versão telemóvel).
- Na versão `docs/` (sem servidor), os dados ficam guardados só naquele
  telemóvel/browser e não há senha — exporte cópias de segurança
  regularmente e não use essa versão se quiser mesmo proteger o stock.
- Na versão com login, o "utilizador" é único e partilhado (não há contas
  separadas por funcionário) — suficiente para controlar quem entra, mas não
  para distinguir quem fez o quê.
