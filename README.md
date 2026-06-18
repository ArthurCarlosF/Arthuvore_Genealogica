# Arthuvore Genealógica

Rede genealógica colaborativa com contas individuais e relações familiares confirmadas.

## Funcionalidades

- Cadastro e login por e-mail e senha.
- ID interno automático para cada usuário.
- Perfil com nome, ano de nascimento, sexo e foto.
- Busca por nome e/ou ano de nascimento.
- Solicitações para adicionar pai, mãe ou filho.
- Vínculo criado somente depois do aceite.
- Árvore com três graus por padrão e filtro de até seis graus.
- Exportação em SVG.
- Painel de solicitações recebidas e enviadas.
- Modo local de demonstração enquanto o Firebase não estiver configurado.

No modo demonstração, use:

```text
E-mail: arthur@demo.com
Senha: demo1234
```

## Configurar Firebase

1. Crie um projeto em [Firebase Console](https://console.firebase.google.com).
2. Adicione um aplicativo Web.
3. Ative **Authentication > Sign-in method > E-mail/senha**.
4. Crie um banco **Cloud Firestore**.
5. Copie a configuração pública do aplicativo para `firebase-config.js`.
6. Publique o conteúdo de `firestore.rules` em **Firestore Database > Regras**.
7. Em **Authentication > Settings > Authorized domains**, inclua:

```text
arthurcarlosf.github.io
```

Depois de configurar `firebase-config.js`, o site detecta o Firebase automaticamente e deixa de usar o modo local.

## Administração

As regras reconhecem administradores pelo custom claim:

```json
{ "admin": true }
```

Esse claim deve ser configurado em ambiente seguro com Firebase Admin SDK ou Cloud Functions. Nunca inclua credenciais administrativas no frontend.

## Estrutura dos dados

### `users/{uid}`

```json
{
  "fullName": "Nome da pessoa",
  "birthYear": 1990,
  "sex": "male",
  "email": "email@example.com",
  "photoUrl": "",
  "fatherId": "",
  "motherId": ""
}
```

### `relationshipRequests/{fromId_toId_relation}`

```json
{
  "fromId": "uid solicitante",
  "toId": "uid destinatário",
  "relation": "father",
  "participants": ["uid1", "uid2"],
  "status": "pending"
}
```

## Publicação

O frontend é estático e pode ser publicado pelo GitHub Pages a partir da branch `main`.
