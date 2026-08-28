# Avaliação do Site após as correções locais — 27/08/2026

## Conclusão

**Nota local da branch: 9,2/10.** O resultado ainda não é 10/10 e não representa produção, porque esta fase termina em Draft PR sem merge ou deploy.

## Notas por área

| Área | Nota | Evidência | Lacuna para 10 |
|---|---:|---|---|
| Busca, filtros e URL | 9,8 | 19 resultados na URL filtrada; parâmetros preservados ao abrir e voltar da ficha | confirmar novamente após deploy |
| Lista e mapa | 9,8 | 19 imóveis representados em 17 pontos; dois agrupados no mesmo endereço; 17 marcadores confirmados em 390×844 | observabilidade de dados de campo |
| Acessibilidade dos modais | 9,7 | nome acessível, trap de foco, Escape e botão devolvendo foco nos filtros e na galeria | auditoria assistiva completa com leitor de tela |
| Mobile e responsividade | 9,7 | ficha, galeria, filtros e mapa em 390×844; `scrollWidth` igual a 390, sem overflow horizontal | ampliar matriz de aparelhos reais |
| Performance técnica | 9,4 | transferência inicial de 377.060 bytes; GIF de 8,1 MB retirado do caminho do Site e substituído por pôster de 208.448 bytes | medir Core Web Vitals de campo após deploy |
| SEO e compartilhamento | 9,6 | 124 fichas pré-renderizadas; home com OG/Twitter e imagem oficial; MOA sem GIF nos metadados | automatizar rebuild após publicação no ERP |
| Segurança de frontend | 9,0 | nenhum segredo novo; CSP preservada em Report-Only; console local limpo | validar fluxos condicionais e só então promover CSP |
| Analytics e atribuição | 8,8 | tracking existente e testes de leads sem regressão | backend ainda não aceita evento semântico de Web Vitals |
| Qualidade do catálogo | 8,0 | nenhuma coordenada inventada; Site mantém fonte pública canônica | revisar 14 descrições e 11 imagens no ERP |

## Verificações executadas

- build e verificador bloqueante aprovados;
- 108/108 testes automatizados verdes;
- smoke HTTP aprovado em seis rotas ativas e uma desativada;
- smoke SEO aprovado em duas fichas distintas e uma rota 404/noindex;
- desktop: filtros, mapa, ficha e foco;
- mobile 390×844: lista, mapa com 17 pontos, ficha, galeria e ausência de overflow;
- console local sem erro ou aviso após a correção do asset do MOA;
- produção atual consultada apenas para CSP: nenhuma violação CSP observada na rota filtrada, com cobertura insuficiente para tornar a política bloqueante.

## O que impede 10/10 comprovado

1. A branch ainda não passou pelo preview/produção.
2. Não existem Core Web Vitals de campo instrumentados no transporte atual.
3. A CSP continua Report-Only por prudência e falta de cobertura dos fluxos condicionais.
4. O rebuild de SEO ainda não é disparado automaticamente pela publicação no ERP.
5. Permanecem 14 descrições e 11 imagens que exigem decisão editorial na fonte canônica.
6. A revisão de segurança do backend de leads pertence a uma fase separada e autorizada.
