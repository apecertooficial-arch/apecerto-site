# Runbook executável — release do PR #34

## Estado estável e rollback

- Serviço Render: `srv-da0dhd7lk1mc73fnoj5g`.
- Commit estável antes da entrega: `255a7558cd49138f5126c5e343115fb6fe254f66`.
- Deploy estável: `dep-da8sk5k9v7es73cg72f0`.
- Versão pública estável: `1f70df31b3f3b230`.
- Rollback Render: selecionar o deploy `dep-da8sk5k9v7es73cg72f0` no histórico do serviço e acionar Rollback; depois confirmar `/version.json` e repetir os smokes abaixo.
- Esta release não modifica Supabase, banco, ERP, domínio, credenciais ou dados.

## 1. Preview temporário

1. Reconfirmar PR Draft, base, HEAD remoto, ausência de conflitos e CI verde.
2. Criar preview isolado do serviço estático vinculado exatamente ao HEAD aprovado.
3. Confirmar que o preview serve o commit esperado e não altera domínio/branch/auto-deploy do serviço principal.
4. Confirmar no dashboard que não existe regra ativa de rewrite para `/imovel/*`.
5. Gate HTTP direto:
   - home e assets críticos sem 404/5xx;
   - duas fichas distintas com `Content-Type: text/html; charset=utf-8`;
   - title, description, canonical, OG, Twitter e JSON-LD distintos/factuais;
   - slug inexistente com 404, `noindex,nofollow` e `Content-Type: text/html; charset=utf-8`;
   - imagem social 200 e tipo de imagem correto.
6. Gate navegador em 1440×900 e 390×844:
   - home, busca e filtros na URL;
   - 19 resultados do cenário citado, aviso factual e zero marcador inventado;
   - ficha com fotos, galeria e voltar preservando query;
   - galeria e filtros com foco, Escape, botão e retorno ao gatilho;
   - Sara, Anunciar e portal nos estados seguros, sem submissão;
   - zero overflow, erro de console, 5xx ou asset quebrado.
7. Registrar métricas de laboratório para home, resultados e ficha; não chamar de Core Web Vitals de campo.

## 2. Merge controlado

1. Reconfirmar que o HEAD do PR é exatamente o SHA servido e aprovado no preview.
2. Reconfirmar CI verde e mergeabilidade.
3. Marcar Ready e executar squash merge usando o HEAD como proteção contra corrida.
4. Registrar imediatamente o merge SHA resultante em `main`.

## 3. Deploy de produção

1. Remover somente a regra ativa `/imovel/*` no serviço principal para alinhar a hospedagem ao Blueprint aprovado.
2. No Render, usar **Deploy a specific commit** com o merge SHA registrado; não mudar outras configurações do serviço.
3. Aguardar estado Live e registrar o novo deploy ID.
4. Confirmar que `/version.json` mudou para o artefato do merge e que o SHA de design corresponde à release.
5. Repetir todos os gates HTTP, SEO, navegador desktop/mobile e métricas do preview diretamente em `https://apecerto.com`.

## 4. Critérios objetivos de rollback

Executar rollback imediato se ocorrer qualquer um destes eventos:

- 5xx em home, resultados ou ficha;
- `/version.json` incompatível com o deploy aprovado;
- qualquer `/imovel/*` responder `text/plain`;
- canonical da home numa ficha, metadado duplicado/inventado ou 404 indexável;
- CSS, JavaScript, fonte, imagem social ou primeira foto com 404;
- ficha sem foto, mapa vazio apresentado como completo, perda de filtros/query/voltar;
- erro de runtime no console, overflow horizontal ou formulário abrindo em estado inseguro;
- tracking duplicado observado sem submissão real;
- regressão de laboratório superior a 10% sem explicação técnica verificável.

Após rollback, confirmar novamente o deploy `dep-da8sk5k9v7es73cg72f0`, a versão `1f70df31b3f230` e os smokes estáveis. Não alterar `site-track` nem segurança para evitar o rollback.
