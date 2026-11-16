# Guia de instalação

Este guia instala o Apontamento de Produção em um **servidor local na fábrica** ou em um **servidor na nuvem**, configura o **agente de impressão**, os **tablets** e o **backup**, e explica como **restaurar** um backup em uma instalação limpa.

O sistema roda em Docker. São cinco serviços:

| Serviço            | O que faz                                                  | Porta   |
| ------------------ | ---------------------------------------------------------- | ------- |
| `db`               | Banco de dados PostgreSQL                                  | interna |
| `api`              | Regras de negócio e dados                                  | interna |
| `web`              | Telas (navegador e aplicativo instalado no tablet)         | 8080    |
| `agente-impressao` | Recebe as etiquetas e envia às Zebras pela rede (TCP 9100) | 9180    |
| `backup`           | Cópia diária do banco                                      | —       |

---

## 1. Requisitos

- Um computador Linux (Ubuntu Server 24.04 ou similar) com 2 núcleos, 4 GB de memória e 40 GB de disco livres.
- Docker Engine 27 ou mais recente e o plugin Docker Compose (`docker compose version` deve responder).
- Acesso de rede dos tablets/PCs ao servidor na porta 8080 (ou 443 com HTTPS) e às impressoras Zebra na porta 9100.
- Os arquivos do projeto (pasta com `docker-compose.yml`).

Instalação do Docker no Ubuntu:

```bash
curl -fsSL https://get.docker.com | sh
```

```bash
sudo usermod -aG docker $USER
```

Saia e entre de novo na sessão para o grupo valer.

---

## 2. Servidor local na fábrica

1. Copie a pasta do projeto para o servidor, por exemplo em `/opt/apontamento`, e entre nela:

   ```bash
   cd /opt/apontamento
   ```

2. Crie o arquivo de configuração a partir do modelo:

   ```bash
   cp .env.example .env
   ```

3. Edite o `.env` e troque **obrigatoriamente**:
   - `POSTGRES_PASSWORD`: senha do banco.
   - `JWT_SEGREDO`: um texto longo e aleatório (gere com `openssl rand -hex 32`).
   - `AGENTE_TOKEN`: senha do agente de impressão (será digitada em cada tablet).
   - `CARREGAR_DADOS_EXEMPLO=false` em produção (deixe `true` só para treinamento).

4. Suba o sistema:

   ```bash
   docker compose up -d --build
   ```

5. Confira que tudo está no ar (todos `healthy`, menos `web` e `backup`, que não têm verificação):

   ```bash
   docker compose ps
   ```

6. Abra `http://IP-DO-SERVIDOR:8080` em um navegador. No **primeiro acesso**, com o cadastro de usuários vazio, entre com `admin@admin.com.br` e senha `12345678910`; o sistema pede para trocar a senha.

7. Como superusuário, faça os cadastros (seção 6 da especificação): máquinas, moldes, produtos, conjuntos, horários de turno, equipes, escala, motivos de parada, tipos de perda, locais de estoque, impressoras, layouts de etiqueta, **dispositivos (postos)** com o prefixo de 2 caracteres de cada tablet, e os usuários com seus perfis.

> **Atualização de versão:** copie os arquivos novos por cima, mantendo o `.env` e a pasta `backups`, e rode `docker compose up -d --build`. As migrations do banco são aplicadas sozinhas ao subir a API.

---

## 3. Servidor na nuvem (com HTTPS)

Na nuvem, o acesso precisa de **HTTPS**: o navegador só instala o aplicativo e só guarda dados para uso offline em endereço seguro. O exemplo usa o Caddy, que obtém e renova o certificado sozinho.

1. Crie um servidor Linux na nuvem (2 vCPU, 4 GB), com as portas 80 e 443 abertas, e aponte um nome de domínio para o IP dele (ex.: `apontamento.suaempresa.com.br`).
2. Siga os passos 1 a 4 do item 2, mas **não publique o agente de impressão na nuvem**: no `.env`, deixe `PORTA_AGENTE` sem uso, ou remova o serviço `agente-impressao` do `docker-compose.yml` nesse servidor (ele roda na fábrica, item 4).
3. Crie o arquivo `Caddyfile` na pasta do projeto:

   ```
   apontamento.suaempresa.com.br {
       reverse_proxy localhost:8080
   }
   ```

4. Suba o Caddy:

   ```bash
   docker run -d --name caddy --restart unless-stopped --network host -v $PWD/Caddyfile:/etc/caddy/Caddyfile -v caddy-dados:/data caddy:2
   ```

5. Acesse `https://apontamento.suaempresa.com.br`.

O tempo real do painel usa uma conexão longa; o Caddy já a repassa sem ajuste. Com outro servidor web na frente, desligue o _buffer_ para o caminho `/api/painel/fluxo`.

---

## 3A. Banco no Supabase (opcional)

Em vez do banco local (`db`), o sistema pode usar um PostgreSQL gerenciado no **Supabase**. A API, o site e o agente de impressão continuam rodando no seu servidor (local ou na nuvem); só os dados ficam no Supabase. O Supabase cuida do servidor do banco e faz backups diários do lado dele.

1. No painel do Supabase, abra o projeto (ex.: `gpro-apontamento`) e defina a senha do banco em **Project Settings → Database → Reset database password**. Guarde a senha.
2. Clique em **Connect** (topo da página) → aba **Connection string** → **Session pooler** e copie a URL. Ela tem o formato:

   `postgresql://postgres.REF-DO-PROJETO:[YOUR-PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`

   Use o **Session pooler** (porta 5432): ele funciona em qualquer rede (a conexão direta do plano gratuito é só IPv6) e aceita as migrations e as travas que o sistema usa. Não use o Transaction pooler (porta 6543).

3. No `.env`, troque `[YOUR-PASSWORD]` pela senha e acrescente `?sslmode=require` no fim:

   `SUPABASE_DATABASE_URL=postgresql://postgres.REF-DO-PROJETO:SENHA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require`

   Se a senha tiver caracteres especiais (`@`, `:`, `/`, `#`, `?`), troque cada um pelo código correspondente (`%40`, `%3A`, `%2F`, `%23`, `%3F`).

4. Suba usando o arquivo adicional do Supabase (o banco local não sobe):

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.supabase.yml up -d --build
   ```

   Na primeira subida, a API cria as tabelas no Supabase e, com `CARREGAR_DADOS_EXEMPLO=true`, carrega os dados de exemplo.

5. Para os demais comandos (`ps`, `logs`, `exec`), use sempre os dois arquivos, por exemplo `docker compose -f docker-compose.yml -f docker-compose.supabase.yml logs api`.

**Backup com Supabase:** o serviço `backup` continua gerando a cópia diária na pasta `backups` do servidor, agora a partir do Supabase. Para restaurar uma dessas cópias no Supabase (substitui os dados atuais):

```bash
docker compose -f docker-compose.yml -f docker-compose.supabase.yml stop api web
```

```bash
docker compose -f docker-compose.yml -f docker-compose.supabase.yml run --rm --entrypoint sh backup -c 'pg_restore -d "$DATABASE_URL" --clean --if-exists --no-owner /backups/apontamento-AAAAMMDD-HHMMSS.dump'
```

```bash
docker compose -f docker-compose.yml -f docker-compose.supabase.yml up -d api web
```

**Segurança:** as tabelas do sistema ficam no schema `public` com RLS ligado e sem acesso para os papéis `anon` e `authenticated` do Supabase, então a API REST do Supabase (chave anônima) não lê nada. Todo acesso passa pela API do sistema.

---

## 4. Agente de impressão (rede da fábrica)

O tablet envia cada etiqueta ao agente, que a repassa para a Zebra. Por isso a impressão funciona **mesmo sem internet e com o servidor fora do ar**, desde que tablet, agente e impressora estejam na mesma rede da fábrica.

- **Servidor local:** o agente já sobe junto (`agente-impressao`, porta 9180). Nada a fazer.
- **Aplicação na nuvem:** rode o agente em um computador da fábrica (sempre ligado) com Docker:

  ```bash
  docker compose up -d --build agente-impressao
  ```

  Com a aplicação em HTTPS, o navegador exige que o agente também use HTTPS. Gere um certificado para o IP/nome desse computador, instale-o como confiável nos tablets e informe os arquivos ao agente pelas variáveis `AGENTE_TLS_CERT` e `AGENTE_TLS_KEY` (caminho dentro do contêiner, montando a pasta do certificado como volume).

- Restrinja as impressoras que o agente aceita com `AGENTE_HOSTS` (IPs separados por vírgula) e as origens com `AGENTE_ORIGENS` (endereço do sistema).
- Teste: em **Layouts de etiqueta**, use "Imprimir teste" em cada layout. Os modelos foram montados para 203 dpi; ajuste posições e o tamanho do código de barras se necessário.

---

## 5. Tablets dos apontadores (aplicativo instalável)

1. No tablet, abra o endereço do sistema no Chrome e entre com o usuário do apontador.
2. No menu do Chrome, toque em **Instalar aplicativo** (ou "Adicionar à tela inicial"). O ícone "Apontamento" aparece na tela inicial e abre em tela cheia.
3. No menu do usuário (canto superior direito), toque em **Configurar este posto**:
   - escolha o **dispositivo (posto)**, cujo prefixo vai nos códigos das etiquetas;
   - informe o endereço do **agente de impressão** (ex.: `http://192.168.0.10:9180`) e o token;
   - toque em **Testar agente**.
4. Com conexão, o tablet baixa sozinho os dados para trabalhar offline (rodadas, OPs, fichas, motivos, tipos de perda, conjuntos, layouts, impressoras) e **reserva um bloco de números de etiqueta** (parâmetro `tamanho_bloco_etiquetas`, 1.000 por padrão). A atualização se repete a cada 15 minutos.
5. Deixe o tablet online ao menos uma vez antes de cada turno: assim ele tem os dados e os números atualizados.

**Sem conexão:** o topo da tela mostra "Sem conexão" e quantos lançamentos aguardam envio. Abrir turno, ligar máquinas, criar divisões, lançar, imprimir etiquetas e fechar o turno continuam funcionando. Ao voltar a rede, a fila sobe sozinha, na ordem, sem duplicar. O que o servidor recusar vai para **Lançamentos recusados**.

**Relógio:** a hora do registro de um lançamento offline é a do tablet. Mantenha a data e a hora automáticas no tablet; diferenças grandes aparecem para o superusuário em **Alertas de relógio**.

---

## 6. Backup

O serviço `backup` gera uma cópia do banco **todo dia às 02h00** (fuso de São Paulo) e mantém as **14 mais recentes**, na pasta `backups` do projeto. Para mudar, ajuste no `.env`:

| Variável        | Padrão      | O que é                                  |
| --------------- | ----------- | ---------------------------------------- |
| `BACKUP_HORA`   | `02:00`     | Hora do backup diário (HH:MM)            |
| `RETENCAO_DIAS` | `14`        | Quantos arquivos manter                  |
| `BACKUP_PASTA`  | `./backups` | Pasta do servidor onde os arquivos ficam |

Gerar um backup na hora:

```bash
docker compose exec backup /scripts/backup.sh agora
```

Ver o histórico do serviço:

```bash
docker compose logs backup
```

> **Importante:** um backup que fica só no servidor se perde junto com ele. Copie a pasta `backups` todo dia para outro lugar (outro computador, disco externo ou armazenamento na nuvem). Exemplo com `rsync` para outro computador da rede, agendado no `cron` do servidor:
>
> `30 2 * * * rsync -a /opt/apontamento/backups/ usuario@outro-pc:/copias/apontamento/`

---

## 7. Restaurar um backup (inclusive em instalação limpa)

Use quando o servidor for perdido ou para voltar o banco a um dia anterior. **A restauração substitui todo o conteúdo atual do banco.**

1. **Instalação limpa:** prepare o servidor novo seguindo o item 2 (ou 3) até o passo 4, com o mesmo `.env` do servidor antigo (ou ao menos o mesmo `JWT_SEGREDO`; senhas do banco podem ser novas). Use `CARREGAR_DADOS_EXEMPLO=false`.
2. Copie o arquivo de backup desejado para a pasta `backups` do projeto (ex.: `backups/apontamento-20261116-020000.dump`).
3. Na pasta do projeto, rode:

   ```bash
   sh scripts/restaurar.sh backups/apontamento-20261116-020000.dump
   ```

   O script para a API e o site, recria o banco, restaura o arquivo e sobe tudo de novo.

4. Abra o sistema e entre com um usuário existente no backup. Confira os últimos turnos e etiquetas.
5. Nos tablets, abra o aplicativo com conexão: a fila de cada um sobe normalmente (lançamentos já presentes no backup são reconhecidos e não duplicam).

Se a versão do sistema no servidor novo for mais recente que a do backup, a API aplica as migrations pendentes ao subir, depois da restauração.

---

## 8. Problemas comuns

| Sintoma                                            | O que verificar                                                                 |
| -------------------------------------------------- | ------------------------------------------------------------------------------- |
| `api` não fica `healthy`                           | `docker compose logs api`; senha/URL do banco no `.env`.                        |
| Etiqueta não imprime                               | "Testar agente" no posto; IP/porta da impressora; token do agente; firewall.    |
| Tablet não instala o aplicativo                    | Acesso por HTTPS (nuvem) ou por IP da rede local; Chrome atualizado.            |
| "Sem números de etiqueta reservados" no tablet     | Conecte o tablet: ele reserva um novo bloco sozinho.                            |
| Lançamento aparece em "Lançamentos recusados"      | Leia o motivo; relance corrigido ou descarte com justificativa.                 |
| Líder não consegue aprovar o turno (fila pendente) | O tablet do turno precisa se conectar para enviar a fila.                       |
| Turno aberto em outro tablet com fila não enviada  | Conecte o tablet antigo; se ele quebrou, o líder usa "liberar troca de tablet". |
