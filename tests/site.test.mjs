import test from 'node:test';
import assert from 'node:assert';
import { readFile, access } from 'node:fs/promises';

const existe = p => access(p).then(() => true, () => false);
const assetPublicado = async source => {
  const version = JSON.parse(await readFile('dist/version.json', 'utf8'));
  const publicPath = version.assetMap['/' + source.replace(/^\/+/, '')];
  assert.ok(publicPath, source + ' deve ter nome versionado');
  return publicPath.replace(/^\/+/, '');
};

const pacotePublicado = async (file = 'index.html') => {
  const version = JSON.parse(await readFile('dist/version.json', 'utf8'));
  const shell = await readFile('dist/' + file.replace(/^\/+/, ''), 'utf8');
  const template = await readFile('dist/' + version.templatePath.replace(/^\/+/, ''), 'utf8');
  return { shell, template, out: shell + '\n' + template, version };
};

test('catalogo publico consulta a view site_produtos', async () => {
  const d = await readFile('design/Site ApeCerto.dc.html', 'utf8');
  assert.ok(d.includes('/rest/v1/site_produtos'), 'o catalogo deve ler a view site_produtos');
  assert.ok(d.includes("CATALOGO_VIEW = 'site_produtos_catalogo'"), 'a listagem inicial deve usar o contrato leve');
  assert.ok(d.includes('catalogoLeveDisponivel = false'), 'o site deve manter fallback reversivel enquanto a migration não estiver aplicada');
  assert.ok(d.includes('hidratarEmpreendimentos'), 'a ficha e as galerias devem ser hidratadas em lote sob demanda');
  assert.ok(d.includes('this.carregarProdutos(mais, procurar, tentativa + 1)'), 'leitura do catalogo deve repetir uma vez em falha transitoria');
  assert.ok(d.includes('status === 408 || status === 429 || status >= 500'), 'retry automatico deve ficar restrito a falhas transitorias');
  assert.ok(!d.includes("location.hash === '#cadastro-demo'"), 'a producao nao pode liberar um portal ficticio por hash publico');
  assert.ok(d.includes('carregarProdutosSara(ids, tentativa)'), 'resultados da Sara devem carregar todos os empreendimentos encontrados');
  assert.ok(d.includes("params.set('id', 'in.(' + idsDiretos.join(',') + ')')"), 'a busca da Sara deve consultar os IDs exatos em lotes');
  assert.ok(d.includes('saraEmpreendimentoIds'), 'os IDs de empreendimentos da Sara devem disparar nova consulta');
  assert.ok(d.includes('lancamento,lançamento'), 'a finalidade cadastrada como lançamento deve aparecer na vitrine');
  assert.ok(d.includes("out.fFinalidade === 'aluguel' ? 500 : 100000"), 'a URL de aluguel deve aceitar preço mensal');
  assert.ok(d.includes('precoMinimo()'), 'o slider deve usar escala própria para aluguel');
  assert.ok(d.includes('item.empreendimento_id'), 'a URL gerada pelo ERP deve localizar também o UUID do empreendimento');
  assert.ok(d.includes('marcarImovelNaoEncontrado()'), 'uma rota inválida deve voltar ao catálogo com aviso claro');
  assert.ok(!d.includes('/rest/v1/rpc/site_produto_resolver_slug_legado'), 'aliases legados devem ser resolvidos apenas no servidor');
});

test('frontend público aceita somente token opaco para mídia de Produtos', async () => {
  const design = await readFile('design/Site ApeCerto.dc.html', 'utf8');
  const trecho = design.match(/\n  fotoUrl\(p\) \{([\s\S]*?)\n  \}\n  fotoAlt\(p, fallback\)/);
  assert.ok(trecho, 'o serializador de mídia deve continuar isolado e testável');
  const fotoUrl = new Function('p', trecho[1]);
  const contexto = {
    SB_URL: 'https://project.test.invalid',
    uuidValido: value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
  };
  assert.equal(
    fotoUrl.call(contexto, 'midia:5a9f0112-76b4-4f34-9b63-a675188daf10'),
    'https://project.test.invalid/functions/v1/site-media/5a9f0112-76b4-4f34-9b63-a675188daf10',
  );
  for (const value of [
    'unidades/privado/foto.jpg',
    { storage_path: 'empreendimentos/interno/foto.jpg' },
    '/storage/v1/object/public/empreendimentos/interno/foto.jpg',
  ]) assert.equal(fotoUrl.call(contexto, value), '', 'path físico de Storage deve falhar fechado');
});

test('frontend reduz formatos comuns ao logradouro sem número ou complemento', async () => {
  const design = await readFile('design/Site ApeCerto.dc.html', 'utf8');
  const trecho = design.match(/\n  enderecoPublico\(v\) \{([\s\S]*?)\n  \}\n  numeroPositivo\(v\)/);
  assert.ok(trecho, 'o sanitizador de endereço deve continuar isolado e testável');
  const enderecoPublico = new Function('v', trecho[1]);
  for (const endereco of [
    'Rua Exemplo, 123, apto 45',
    'Rua Exemplo 123 apto 45',
    'Rua Exemplo 123 - Apto 45',
    'Rua Exemplo 123 – apto 45',
    'Rua Exemplo 123 Apto. 45',
    'Rua Exemplo 123 bloco B',
    'Rua Exemplo 123 torre 2',
    'Rua Exemplo 123 fundos',
    'Rua Exemplo fundos',
    'Rua Exemplo sem número',
    'Rua Exemplo sem numero',
  ]) assert.equal(enderecoPublico(endereco), 'Rua Exemplo', endereco);
});

test('cards de bairro nao abrem o seletor de arquivos no site publico', async () => {
  const design = await readFile('design/Site ApeCerto.dc.html', 'utf8');
  const { out } = await pacotePublicado();
  assert.ok(design.includes('<image-slot id="{{ b.slot }}"'), 'o arquivo-fonte deve continuar editável no Cloud Design');
  assert.ok(
    out.includes('data-bairro-image-link="true"'),
    'a imagem do bairro deve ser um link normal para o catalogo',
  );
  assert.ok(out.includes('data-bairro-visual="{{ b.slot }}"'), 'o site publicado deve usar o visual de marca dos bairros');
  assert.ok(out.includes('class="rw-bairro-visual"'), 'o visual publicado deve manter o estilo dedicado');
  assert.doesNotMatch(out, /<image-slot\b/, 'controles do editor não podem chegar ao site público');
  assert.doesNotMatch(out, /<script src="ff9f78ad-2cb1-45e3-80ee-5aeee257da44"/, 'o runtime de upload não pode ser baixado no site público');
});

test('imagens dinâmicas só recebem src depois de o template resolver a URL', async () => {
  const design = await readFile('design/Site ApeCerto.dc.html', 'utf8');
  const { out } = await pacotePublicado();
  const origemLiteral = /<img[^>]*\ssrc="\{\{\s*(?:p\.foto|galFotoAtual)\s*\}\}"/;
  const fundoLiteral = /background-image:\s*url\(['"]?\{\{/;

  assert.doesNotMatch(design, origemLiteral, 'o HTML-fonte não pode disparar uma URL literal do template');
  assert.doesNotMatch(out, origemLiteral, 'o pacote publicado não pode reintroduzir a URL literal');
  assert.doesNotMatch(design, fundoLiteral, 'fundos dinâmicos não podem disparar placeholders antes de serem resolvidos');
  assert.doesNotMatch(out, fundoLiteral, 'o pacote publicado não pode reintroduzir fundos literais inválidos');
  assert.equal((design.match(/data-ape-src="\{\{ p\.foto \}\}"/g) || []).length, 5, 'todos os cards devem usar a fonte inerte');
  assert.equal((design.match(/data-ape-src="\{\{ galFotoAtual \}\}"/g) || []).length, 1, 'a foto principal da galeria deve usar a fonte inerte');
  assert.equal((design.match(/data-ape-src="\{\{ galM[1-5] \}\}"/g) || []).length, 5, 'o mosaico da ficha deve usar imagens reais, sem depender de hidratação de background');
  assert.equal((design.match(/data-ape-src="\{\{ t\.url \}\}"/g) || []).length, 1, 'as miniaturas da galeria devem usar imagens reais');
  assert.doesNotMatch(design, /aria-label="Abrir foto [1-5][^"]*"[^>]*data-ape-bg/, 'os gatilhos da ficha não podem voltar ao hydrator frágil de fundos');
  assert.ok(design.includes("src.includes('{{') || src.includes('}}')"), 'o ativador deve rejeitar placeholders ainda não resolvidos');
  assert.ok(design.includes("img.setAttribute('src', src)"), 'a imagem resolvida deve continuar sendo exibida');
  assert.ok(design.includes("el.style.backgroundImage = 'url(' + JSON.stringify(src) + ')'"), 'o fundo resolvido deve ser aplicado com escape seguro');
});

test('imagens críticas e galerias usam prioridade, dimensões e preparação proporcionais ao espaço', async () => {
  const design = await readFile('design/Site ApeCerto.dc.html', 'utf8');
  const heroGraphic = design.match(/<img class="rw-grafismo"[^>]*src="7c0ea5e0-a948-412d-9180-9335416036e9"[^>]*>/)?.[0] || '';
  const purpleGraphic = design.match(/<img[^>]*src="3c63f1a7-4e93-4c3a-8f10-fa6d729b32ee"[^>]*>/)?.[0] || '';
  const configuratorStart = design.indexOf('configurarImagens() {');
  const imageConfigurator = design.slice(configuratorStart, design.indexOf('  tratarTeclaGlobal(e) {', configuratorStart));

  assert.match(heroGraphic, /loading="eager"/, 'o grafismo visível do hero não pode ser lazy');
  assert.match(heroGraphic, /fetchpriority="high"/, 'o elemento LCP deve ter prioridade alta');
  assert.match(heroGraphic, /width="760" height="360"/, 'o grafismo deve reservar o espaço na proporção correta');
  assert.match(purpleGraphic, /height:\s*auto/, 'o grafismo da faixa roxa não pode deformar');
  assert.match(purpleGraphic, /display:\s*block/, 'o grafismo da faixa roxa deve preservar seu box visual');
  assert.ok(
    imageConfigurator.indexOf("img.setAttribute('sizes'") < imageConfigurator.indexOf("img.setAttribute('srcset'"),
    'sizes deve existir antes de srcset para o navegador não baixar a maior foto',
  );
  assert.ok(design.includes('(max-width: 1100px) 50vw, 384px'), 'cards desktop devem limitar a largura solicitada à largura real');
  assert.ok(design.includes('agendarFotosAdjacentes'), 'o carrossel deve preparar somente as próximas fotos necessárias');
  assert.doesNotMatch(design, /prepararFoto\(fotos\[\(atual - 1 \+ fotos\.length\)/, 'a galeria não deve baixar também a foto anterior em segundo plano');
  assert.ok(design.includes('typeof imagem.decode === \'function\''), 'a próxima foto deve ser decodificada antes da troca');
  assert.ok(design.includes('.slice(0, 6)'), 'a preparação automática deve ficar limitada aos seis cards visíveis');
  assert.match(design, /if \(det\) \{[\s\S]*?if \(this\.state\.galOn\)[\s\S]*?return;[\s\S]*?const rows =/, 'uma galeria aberta deve ter prioridade sobre fotos invisíveis dos cards');
  assert.ok(design.includes('const imageOnlyUpdate ='), 'a troca de foto deve ser reconhecida como atualização visual isolada');
  assert.match(design, /if \(!imageOnlyUpdate\) \{[\s\S]*?this\.syncListaMapa\(\);/, 'a troca de foto não pode reconstruir o mapa inteiro');
  assert.ok(design.includes('this.fotoCardReq.get(id) !== req'), 'uma foto antiga não pode vencer o clique mais recente no card');
  assert.ok(design.includes('this.fotoGaleriaReq === req'), 'uma foto antiga não pode vencer o clique mais recente na galeria');
  assert.ok((design.match(/this\.fotoGaleriaReq \+= 1;/g) || []).length >= 4, 'abrir e fechar imóvel ou galeria deve invalidar fotos pendentes');
});

test('acesso do portal associa rótulos e orienta preenchimento e leitores de tela', async () => {
  const design = await readFile('design/Site ApeCerto.dc.html', 'utf8');
  const campos = [
    ['email', 'email'],
    ['senha', '{{ authSenhaAutocomplete }}'],
  ];

  for (const [campo, autocomplete] of campos) {
    assert.ok(design.includes(`label for="portal-auth-${campo}"`), `o rótulo de ${campo} deve apontar para o campo`);
    assert.match(
      design,
      new RegExp(`<input id="portal-auth-${campo}"[^>]*autocomplete="${autocomplete.replace(/[{}]/g, '\\$&')}"[^>]*aria-required="true"`),
      `${campo} deve expor autocomplete e obrigatoriedade`,
    );
  }
  assert.match(design, /Acesse o portal do proprietário/);
  assert.match(design, /O acesso é liberado pela equipe depois do primeiro contato/);
  assert.doesNotMatch(design, />Crie seu acesso<\/button>/, 'o portal não deve oferecer um signup que a infraestrutura recusa');
  assert.ok(design.includes('role="alert" aria-live="assertive"'), 'erros de autenticação devem ser anunciados imediatamente');
  assert.ok(design.includes('role="status" aria-live="polite"'), 'confirmações de autenticação devem ser anunciadas sem interromper');
});

test('Sara consulta somente a vitrine pública já filtrada pelo banco', async () => {
  const fn = await readFile('supabase/functions/sara-site/index.ts', 'utf8');
  assert.match(fn, /\.from\("site_produtos"\)/);
  assert.doesNotMatch(fn, /\.from\("(?:empreendimentos|unidades)"\)/);
});

test('build injeta o design no pacote-base', async t => {
  if (!(await existe('index.html'))) return t.skip('index.html (pacote-base) ainda nao esta no repo');
  const { shell, out } = await pacotePublicado();
  const design = await readFile('design/Site ApeCerto.dc.html', 'utf8');
  assert.ok(shell.startsWith('<!DOCTYPE html>'), 'dist/index.html deve ser um documento HTML');
  assert.ok(shell.includes('__bundler/template'), 'bloco de template deve existir no dist');
  assert.ok(out.includes('site_produtos'), 'design injetado deve consultar site_produtos');
  assert.ok(design.includes('slugImovelDaRota') && design.includes("q.get('imovel')"), 'o site deve abrir o imóvel específico por URL limpa e manter o fallback do ERP');
  assert.ok(design.includes('item.empreendimento_slug'), 'a URL limpa do empreendimento deve abrir uma unidade publicada quando nenhuma unidade foi escolhida');
  assert.ok(design.includes("r.titulo || r.nome"), 'o título comercial do ERP deve ser priorizado na vitrine');
  assert.ok(design.includes('detTourUrl'), 'o tour virtual cadastrado no ERP deve aparecer na ficha pública');
  assert.ok(design.includes('normalizarPrecoImovel'), 'preços legados em milhares não podem aparecer como centenas de reais');
  assert.match(
    out,
    /#__bundler_loading,\s*#__bundler_thumbnail\s*\{\s*display:\s*none;/,
    'a tela temporaria com o logo gigante deve permanecer oculta',
  );
  assert.ok(
    out.includes('#__bundler_loading,#__bundler_thumbnail{display:none!important}'),
    'a camada de producao deve ocultar a tela mesmo apos atualizar o payload do design',
  );
});

test('logos dos cabecalhos preservam a proporcao apos o runtime informar dimensoes intrinsecas', async () => {
  const design = await readFile('design/Site ApeCerto.dc.html', 'utf8');
  const logos = [...design.matchAll(/<img\b[^>]*alt="apêcerto"[^>]*>/g)].map(match => match[0]);

  assert.ok(logos.length >= 5, 'todas as variacoes visuais do logo devem ser verificadas');
  for (const logo of logos) {
    assert.match(
      logo,
      /style="[^"]*\bwidth:\s*(?:auto|fit-content)\b/,
      'o logo não pode usar como largura visual o atributo width injetado pelo runtime',
    );
  }

  const logosDeCabecalho = logos.filter(logo => logo.includes('display: block'));
  for (const logo of logosDeCabecalho) {
    assert.match(logo, /\bflex-shrink:\s*0\b/, 'o logo do cabeçalho não pode ser deformado pelo flexbox');
  }
});

test('grafismos da marca preservam a proporcao depois da externalizacao das imagens', async () => {
  const design = await readFile('design/Site ApeCerto.dc.html', 'utf8');
  const grafismos = [...design.matchAll(/<img\b[^>]*class="rw-grafismo"[^>]*>/g)].map(match => match[0]);

  assert.equal(grafismos.length, 2, 'home e portal devem usar o grafismo protegido');
  for (const grafismo of grafismos) {
    assert.match(
      grafismo,
      /style="[^"]*\bheight:\s*auto\b/,
      'a altura intrinseca injetada pelo runtime nao pode esticar o grafismo',
    );
    assert.match(grafismo, /style="[^"]*\bdisplay:\s*block\b/, 'o grafismo nao deve criar espaco de linha');
  }
});

test('mapa ignora coordenadas ausentes ou impossiveis antes de calcular o enquadramento', async () => {
  const design = await readFile('design/Site ApeCerto.dc.html', 'utf8');
  const trecho = design.match(/\n  coordenadas\(r\) \{([\s\S]*?)\n  \}\n  contarResultadosSemCoordenadas\(rows\)/);
  assert.ok(trecho, 'a validação de coordenadas deve continuar isolada e testável');
  const coordenadas = new Function('r', trecho[1]);

  assert.equal(coordenadas({ latitude: null, longitude: null }), null, 'NULL do banco não pode virar o ponto 0,0');
  assert.equal(coordenadas({ latitude: '', longitude: '' }), null, 'campos vazios não podem criar marcador');
  assert.equal(coordenadas({ latitude: '-23.603', longitude: '46.667' }), null, 'longitude com sinal invertido não pode abrir o mapa até a África');
  assert.equal(coordenadas({ latitude: '0', longitude: '0' }), null, 'o ponto nulo explícito deve ser descartado');
  assert.equal(coordenadas({ latitude: '-22.90', longitude: '-43.20' }), null, 'um ponto fora da região atendida não pode afastar o mapa de São Paulo');
  assert.deepEqual(
    coordenadas({ latitude: '-23.603', longitude: '-46.667' }),
    [-23.603, -46.667],
    'uma coordenada válida de São Paulo deve continuar no mapa',
  );
});

test('aviso do mapa conta dinamicamente somente resultados sem coordenadas válidas', async () => {
  const design = await readFile('design/Site ApeCerto.dc.html', 'utf8');
  const coordenadasTrecho = design.match(/\n  coordenadas\(r\) \{([\s\S]*?)\n  \}\n  contarResultadosSemCoordenadas\(rows\)/);
  const contadorTrecho = design.match(/\n  contarResultadosSemCoordenadas\(rows\) \{([\s\S]*?)\n  \}\n  saraBuscar\(txt\)/);
  assert.ok(coordenadasTrecho && contadorTrecho, 'validação e contador devem permanecer isolados e testáveis');
  const coordenadas = new Function('r', coordenadasTrecho[1]);
  const contar = new Function('rows', contadorTrecho[1]);
  const contexto = { coordenadas };

  const validosMesmoEmpreendimento = [
    { id: 'u1', empreendimento_id: 'e1', latitude: -23.60, longitude: -46.66 },
    { id: 'u2', empreendimento_id: 'e1', latitude: '-23.60', longitude: '-46.66' },
  ];
  assert.equal(contar.call(contexto, validosMesmoEmpreendimento), 0, 'unidades agrupadas com localização não são omissões');
  assert.equal(contar.call(contexto, validosMesmoEmpreendimento.concat([
    { id: 'u3', latitude: null, longitude: null },
    { id: 'u4', latitude: 'abc', longitude: '-46.66' },
    { id: 'u5', latitude: '0', longitude: '0' },
    { id: 'u6', latitude: '-22.9', longitude: '-43.2' },
  ])), 4);
  assert.equal(contar.call(contexto, [validosMesmoEmpreendimento[0]]), 0, 'a contagem deve reagir ao conjunto filtrado atual');
  assert.equal(contar.call(contexto, []), 0);
  assert.equal(contar.call(contexto, null), 0);
  assert.match(design, /data-map-representation-status=""[^>]*role="status"[^>]*aria-live="polite"|role="status"[^>]*aria-live="polite"[^>]*data-map-representation-status=""/);
  assert.match(design, /const mapaRepresentacao = this\.resumoRepresentacaoMapa\(filtradosAll\)/, 'o aviso deve acompanhar filtros e ordenação atuais');
  assert.doesNotMatch(design, /latitude[^\n]{0,80}=\s*-23\.5|longitude[^\n]{0,80}=\s*-46\.6/, 'o site não pode fabricar coordenada substituta');
});

test('mapa carrega o catalogo atual sem limite de preco ou paginacao escondida', async () => {
  const design = await readFile('design/Site ApeCerto.dc.html', 'utf8');
  assert.match(
    design,
    /fFinalidade:\s*'venda',\s*fPreco:\s*null,[\s\S]{0,120}?fPrecoMax:\s*null,[\s\S]{0,120}?precoTocado:\s*false/,
    'o estado inicial deve representar busca sem limite de preco',
  );
  assert.match(design, /const tamanho = 100;/, 'a primeira requisicao deve comportar todo o catalogo atual');
  assert.match(design, /else if \(temMais\) this\.carregarProdutos\(true\);/, 'lotes futuros devem ser carregados automaticamente');
  assert.match(
    design,
    /Range:\s*inicio \+ '-' \+ \(inicio \+ tamanho - 1\)/,
    'o Range deve continuar derivado do tamanho auditado',
  );
});

test('Leaflet e tiles só carregam quando um mapa se aproxima da tela', async () => {
  const design = await readFile('design/Site ApeCerto.dc.html', 'utf8');
  assert.doesNotMatch(design, /<script src="4e06a80d-cb55-4dd3-8f0d-a47dbcf50aa4"/);
  assert.match(design, /data-ape-leaflet-src="4e06a80d-cb55-4dd3-8f0d-a47dbcf50aa4"/);
  assert.match(design, /IntersectionObserver/);
  assert.match(design, /rootMargin:\s*'120px 0px'/);
  assert.match(design, /carregarLeaflet\(\)/);
  assert.match(design, /this\.observarMapa\(el/);
});

test('ajustes de acessibilidade mantêm a identidade e resolvem as falhas medidas', async () => {
  const design = await readFile('design/Site ApeCerto.dc.html', 'utf8');
  assert.match(design, /--ape-orange:\s*#FF7000/i, 'o laranja original da marca deve comandar a interface');
  assert.match(design, /--ape-purple:\s*#8B00CC/i, 'o roxo original da marca deve permanecer intacto');
  assert.match(design, /--ape-orange-action:\s*#C04E00/i, 'ações que exigem texto branco devem usar a variação acessível');
  assert.match(design, /--ape-orange-text:\s*#B84B00/i);
  assert.match(design, /--fg-muted:\s*var\(--neutral-500\)/);
  assert.match(design, /<label for="preco-minimo"[^>]*>Mínimo<\/label>[\s\S]{0,300}?<input id="preco-minimo" type="range" class="ape-range"/);
  assert.match(design, /<label for="preco-maximo"[^>]*>Máximo<\/label>[\s\S]{0,300}?<input id="preco-maximo" type="range" class="ape-range"/);
  assert.doesNotMatch(design, /class="ape-range ape-range-dual"/, 'os controles mínimo e máximo não podem continuar sobrepostos');
  assert.match(design, /prefers-reduced-motion:\s*reduce/);
  assert.match(design, /movimentoScroll\(\)/);
  assert.equal((design.match(/<button data-favorito-card/g) || []).length, 5, 'todos os formatos de card devem manter favoritos acessíveis');
  assert.match(design, /aria-label="\{\{ p\.favLabel \}\}" aria-pressed="\{\{ p\.fav \}\}"/);
  assert.match(design, /favLabel: fav \? 'Remover dos favoritos' : 'Adicionar aos favoritos'/);
  assert.match(design, /e\.metaKey \|\| e\.ctrlKey \|\| e\.shiftKey \|\| e\.altKey/, 'links dos imóveis devem preservar abrir em nova aba');
  assert.match(design, /document\.querySelector\('\.rw-skip'\)/, 'o link de pular conteúdo deve sair da árvore acessível durante modais');
  assert.match(design, /document\.querySelector\('\.rw-zap-flutuante'\)/, 'o WhatsApp flutuante não pode receber foco atrás de modais');
  assert.match(design, /zapFlutuanteOn: !det && !st\.portalOn && !st\.galOn && !st\.fichaOn/, 'o WhatsApp flutuante deve desaparecer enquanto outro fluxo está aberto');
  assert.match(design, /\[data-ficha-modal\] input\[name="nome"\]/, 'o financiamento deve iniciar o foco no primeiro campo');
  assert.match(design, /flex-wrap: nowrap; max-height: 76px; overflow-x: auto; overflow-y: hidden/, 'as miniaturas precisam de rolagem horizontal sem escapar do modal');
  assert.match(design, /flex: 0 0 88px/, 'miniaturas não podem encolher no celular');
  assert.match(design, /data-financing-success="" tabindex="-1" role="status"/, 'a confirmação financeira deve aceitar foco programático');
  assert.match(design, /id="galeria-titulo" aria-live="polite" aria-atomic="true"/, 'a posição da galeria deve ser anunciada');
  assert.match(design, /alt="\{\{ galFotoAlt \}\}"/, 'cada foto deve informar posição e grupo no texto alternativo');
  assert.match(design, /this\.portalFocusOrigin = \(e && e\.currentTarget\) \|\| document\.activeElement/, 'o portal deve guardar o acionador');
  assert.match(design, /this\.menuMobileFocusOrigin && this\.menuMobileFocusOrigin\.focus/, 'o menu móvel deve restaurar o foco');
  assert.match(design, /aria-busy="\{\{ produtosCarregando \}\}"/, 'a atualização do catálogo precisa comunicar seu estado');
  assert.match(design, /if \(this\.state\.saraOn\) \{ e\.preventDefault\(\); this\.setState\(\{ saraOn: false \}/, 'a busca da Sara deve fechar por Escape');
  assert.doesNotMatch(design, /<h4[^>]*>\{\{ grupo\.etapa \}\}<\/h4>/);
  assert.match(design, /<h3[^>]*>\{\{ grupo\.etapa \}\}<\/h3>/);
});

test('vitrine prioriza decisão do cliente e evita controles ou dados enganosos', async () => {
  const design = await readFile('design/Site ApeCerto.dc.html', 'utf8');
  assert.match(design, /tituloComercial\(r\)/, 'cards e ficha devem usar um título comercial');
  assert.match(design, /numeroPositivo\(v\)/, 'características zeradas devem ser normalizadas antes de aparecer');
  assert.match(design, /galOn:\s*n > 1,/, 'o card não pode mostrar carrossel antes de existirem duas fotos reais');
  assert.match(design, /setTimeout\(resolve, 350\)/, 'a troca de foto não pode ficar presa por quase um segundo');
  assert.match(design, /ordenarProdutos\(rows, criterio\)/, 'a lista deve permitir ordenação previsível');
  assert.match(design, /aria-label="Ordenar imóveis"/, 'a ordenação precisa ser acessível');
  assert.match(design, /moa\/4lq4pd7p32p\.gif/);
  assert.match(design, /assets\/media\/fac779ec499e72abf87e\.jpg/, 'o GIF pesado do MOA deve usar o poster local otimizado');
  assert.match(design, /const fotoMeta = foto \? new URL\(foto, location\.origin\)\.href : ''/, 'metadados SPA devem transformar o asset local em URL absoluta');
});

test('resultados oferecem filtros avancados verdadeiros e compartilháveis', async () => {
  const design = await readFile('design/Site ApeCerto.dc.html', 'utf8');

  assert.match(design, /aria-controls="filtros-avancados"/, 'a barra de resultados deve abrir o painel de filtros');
  assert.match(design, /id="filtros-avancados"[^>]*role="dialog"/, 'o painel deve ser identificado como dialogo acessível');
  assert.match(design, /id="filtros-avancados"[^>]*aria-label="Mais filtros"/, 'o painel deve ter nome acessível explícito');
  assert.match(design, /aria-label="Área mínima em metros quadrados"/, 'a área mínima deve ter rótulo acessível');
  assert.match(design, /aria-label="Área máxima em metros quadrados"/, 'a área máxima deve ter rótulo acessível');
  assert.match(design, /aria-label="Quantidade mínima de banheiros"/, 'banheiros devem usar um controle explícito');
  assert.match(design, /aria-label="Quantidade mínima de suítes"/, 'suítes devem usar um controle explícito');
  assert.match(design, /aria-label="Tipo do imóvel"/, 'o tipo do imóvel deve ser filtrável');
  assert.match(design, /set\('area_min', st\.fAreaMin \|\| null\)/, 'a área mínima deve ser preservada na URL');
  assert.match(design, /set\('area_max', st\.fAreaMax \|\| null\)/, 'a área máxima deve ser preservada na URL');
  assert.match(design, /set\('banheiros', st\.fBanheiros \|\| null\)/, 'banheiros devem ser preservados na URL');
  assert.match(design, /set\('suites', st\.fSuites \|\| null\)/, 'suítes devem ser preservadas na URL');
  assert.match(design, /set\('tipo', st\.fTipo \|\| null\)/, 'o tipo deve ser preservado na URL');
  assert.match(design, /const areaOk = r =>/, 'o mesmo filtro de área deve alimentar lista e mapa');
  assert.match(design, /const banheirosOk = r =>/, 'o mesmo filtro de banheiros deve alimentar lista e mapa');
  assert.match(design, /const suitesOk = r =>/, 'o mesmo filtro de suítes deve alimentar lista e mapa');
  assert.match(design, /const tipoOk = r =>/, 'o mesmo filtro de tipo deve alimentar lista e mapa');
  assert.match(design, /tipologia:\s*u\.tipologia \|\| r\.tipologia \|\| null/, 'cada unidade precisa preservar a tipologia publicada pelo ERP');
  assert.match(design, /tipologiaUnidade \? null : r\.dormitorios/, 'uma unidade identificada como apartamento não pode herdar zero dormitórios do agregado do empreendimento');
  assert.match(design, /const studio = tipologia \? \/studio\/i\.test\(tipologia\)/, 'a tipologia explícita deve prevalecer sobre agregados no filtro de studio');
  assert.match(design, /min > max \? \{ fAreaMin: String\(max\), fAreaMax: String\(min\) \}/, 'a aplicação deve corrigir uma faixa de área invertida');
});

test('ficha usa uma experiencia de rota sem manter a home ativa atrás', async () => {
  const design = await readFile('design/Site ApeCerto.dc.html', 'utf8');

  assert.match(design, /<sc-if value="\{\{ siteShellOn \}\}"[^>]*>[\s\S]{0,80}<div data-site-shell="">/, 'a home deve ser desmontada, não apenas escondida, enquanto a ficha está ativa');
  assert.match(design, /siteShellOn:\s*!rotaFichaAtiva/, 'a rota deve controlar a montagem exclusiva da home');
  assert.doesNotMatch(design, /siteShellDisplay|siteShellOculto/, 'a implementação não pode voltar a manter o catálogo oculto por CSS');
  assert.match(design, /data-property-route=""[^>]*role="main"/, 'a ficha deve se apresentar como conteúdo principal da rota');
  assert.doesNotMatch(design, /data-det-topo=""[^>]*role="dialog"/, 'a página do imóvel não deve continuar se anunciando como modal');
  assert.match(design, /rotaFichaAtiva/, 'a rota limpa deve controlar a separação entre home e ficha');
  assert.match(design, /detRouteLoading/, 'a navegação direta deve mostrar carregamento próprio em vez da home');
  assert.match(design, /detRouteErro/, 'a ficha deve oferecer recuperação se a conexão falhar');
  assert.match(design, /tentarDetRoute/, 'a falha da ficha deve permitir tentar novamente');
  assert.match(design, /voltarCatalogoRota/, 'a falha da ficha deve permitir voltar ao catálogo');
});

test('locação só fica disponível quando a vitrine pública tiver imóveis', async () => {
  const design = await readFile('design/Site ApeCerto.dc.html', 'utf8');
  assert.match(design, /carregarDisponibilidadeAluguel\(\)/);
  assert.match(design, /site_produtos_catalogo/);
  assert.match(design, /finalidade\.in\.\(aluguel,alugar,locacao,locação\)/);
  assert.match(design, /<sc-if value="\{\{ aluguelDisponivel \}\}"/);
  assert.match(design, /aluguelDisponivel:\s*!!st\.aluguelDisponivel/);
});

test('resultado no celular prioriza lista, filtros e alvos de toque confortáveis', async () => {
  const design = await readFile('design/Site ApeCerto.dc.html', 'utf8');
  assert.match(design, /\.rw-dividida\s*\{\s*display:\s*none\s*!important/);
  assert.match(design, /\.rw-result-tools\s*\{[\s\S]{0,300}?position:\s*sticky/);
  assert.match(design, /\.rw-result-tools\s*\{[\s\S]{0,500}?display:\s*grid\s*!important/);
  assert.match(design, /\.rw-tool-sort, \.rw-tool-view\s*\{\s*grid-column:\s*1 \/ -1/);
  assert.doesNotMatch(design, /\.rw-result-tools\s*\{[^}]*overflow-x:\s*auto/, 'os controles não podem depender de uma rolagem horizontal sem affordance');
  assert.match(design, /button\[aria-label="Foto anterior"\][\s\S]{0,160}?width:\s*44px\s*!important/);
  assert.match(design, /const vistaEfetiva = mapaRepresentacao\.pontos === 0 \? 'lista' : \(mobile && st\.vista === 'dividida' \? 'lista' : st\.vista\)/);
});

test('hero e navegação preservam hierarquia e legibilidade no desktop e no celular', async () => {
  const design = await readFile('design/Site ApeCerto.dc.html', 'utf8');
  assert.match(design, /class="rw-desk rw-nav-primary" aria-label="Navegação principal"/);
  assert.match(design, />Anunciar imóvel<\/a>/);
  assert.match(design, /class="rw-account-link"[^>]*>Minha conta<\/a>/);
  assert.match(design, /class="rw-hero-main-filters"/);
  assert.match(design, /\.rw-hero-main-filters\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\)/);
  assert.match(design, /\.rw-search-primary button\s*\{[^}]*white-space:\s*nowrap/);
  assert.match(design, /mobile \? 'Ver apês à venda →' : 'Buscar apê pra comprar →'/);
  assert.match(design, /bairroPlaceholder:\s*mobile \? 'Bairro' : 'Todos os bairros'/);
  assert.match(design, /statusPlaceholder:\s*mobile \? 'Status' : 'Qualquer status'/);
  assert.match(design, /padding:\s*48px 24px 32px; display:\s*grid/);
  assert.match(design, /resultsPadding:\s*st\.buscaAtiva \? '40px 24px 88px' : '32px 24px 88px'/);
});

test('capas usam proporção previsível, skeleton e fallback sem inventar ativos', async () => {
  const design = await readFile('design/Site ApeCerto.dc.html', 'utf8');
  assert.match(design, /\.rw-card-photo\s*\{[^}]*aspect-ratio:\s*4 \/ 3/);
  assert.match(design, /\.rw-card-photo::before[^}]*animation:\s*ape-shimmer/);
  assert.match(design, /\.rw-card-photo::after\s*\{[^}]*content:\s*"Foto em preparação"/);
  assert.match(design, /fotoEstado:\s*n > 0 \? 'is-loading' : 'is-error'/);
  assert.match(design, /img\.addEventListener\('load', \(\) => marcarCapa\('is-loaded'\)/);
  assert.match(design, /img\.addEventListener\('error', \(\) => marcarCapa\('is-error'\)/);
});

test('busca entra em modo de resultados focado sem perder o caminho de volta', async () => {
  const design = await readFile('design/Site ApeCerto.dc.html', 'utf8');
  assert.match(design, /buscaAtiva:\s*false/);
  assert.match(design, /id="buscar"[^>]*style="[^"]*display:\s*\{\{ heroDisplay \}\}/);
  assert.match(design, /class="rw-sec \{\{ resultsModeClass \}\}" id="apes"/);
  assert.match(design, /buscar:\s*\(\)\s*=>\s*this\.setState\(\{\s*buscaAtiva:\s*true/);
  assert.match(design, /voltarInicio:\s*\(\)\s*=>\s*this\.setState\(\{\s*buscaAtiva:\s*false/);
  assert.match(design, /Voltar ao início/);
});

test('cards e mapa se destacam mutuamente sem recriar o catálogo', async () => {
  const design = await readFile('design/Site ApeCerto.dc.html', 'utf8');
  assert.match(design, /class="rw-card-produto" data-produto-id="\{\{ p\.id \}\}"/);
  assert.match(design, /listaMapaMarkers\s*=\s*new Map\(\)/);
  assert.match(design, /grupo\.itens\.forEach\(r\s*=>\s*this\.listaMapaMarkers\.set\(String\(r\.id\),\s*mk\)\)/);
  assert.match(design, /destacarCardNoMapa\(id\)/);
  assert.match(design, /closest\('\.rw-card-produto\[data-produto-id\]'\)/);
});

test('mapa permite aplicar a área visível sem esconder o caminho de limpeza', async () => {
  const design = await readFile('design/Site ApeCerto.dc.html', 'utf8');
  assert.match(design, /mapaBounds:\s*null/);
  assert.match(design, /Buscar nesta área/);
  assert.match(design, /m\.on\('dragend zoomend'/);
  assert.match(design, /aplicarMapaBounds\(\)/);
  assert.match(design, /boundsOk\(r\)/);
  assert.match(design, /mapaBounds:\s*null[\s\S]{0,220}?mapaBuscaPendente:\s*false/);
});

test('detalhe móvel mantém conversão visível e galeria responde a swipe', async () => {
  const design = await readFile('design/Site ApeCerto.dc.html', 'utf8');
  assert.match(design, /class="rw-mobile-detail-cta rw-m"/);
  assert.match(design, /sc-camel-on-click="\{\{ detAgendarVisita \}\}"/);
  assert.match(design, /detAgendarVisita:\s*\(\)\s*=>\s*this\.focarFormularioVisita\(\)/);
  assert.match(design, /sc-camel-on-touch-start="\{\{ galTouchStart \}\}"/);
  assert.match(design, /sc-camel-on-touch-end="\{\{ galTouchEnd \}\}"/);
  assert.match(design, /Math\.abs\(delta\)\s*<\s*45/);
});

test('mapa agrupa unidades por empreendimento sem esconder unidades do popup', async () => {
  const design = await readFile('design/Site ApeCerto.dc.html', 'utf8');
  const trecho = design.match(/\n  gruposMapa\(rows\) \{([\s\S]*?)\n  \}\n  resumoRepresentacaoMapa\(rows\)/);
  assert.ok(trecho, 'o agrupamento do mapa deve continuar isolado e testavel');
  const gruposMapa = new Function('rows', trecho[1]);
  const contexto = {
    coordenadas: r => r.latitude == null || r.longitude == null ? null : [Number(r.latitude), Number(r.longitude)],
    empreendimentoId: r => r.empreendimento_id || null,
  };
  const grupos = gruposMapa.call(contexto, [
    { id: 'u1', empreendimento_id: 'e1', empreendimento_nome: 'Predio A', latitude: -23.60, longitude: -46.66 },
    { id: 'u2', empreendimento_id: 'e1', empreendimento_nome: 'Predio A', latitude: -23.60, longitude: -46.66 },
    { id: 'u3', empreendimento_id: 'e2', empreendimento_nome: 'Predio B', latitude: -23.60, longitude: -46.66 },
    { id: 'u4', empreendimento_id: 'e3', empreendimento_nome: 'Sem local', latitude: null, longitude: null },
  ]);

  assert.equal(grupos.length, 2, 'cada empreendimento localizado deve produzir exatamente um grupo');
  assert.equal(grupos[0].itens.length, 2, 'todas as unidades do empreendimento devem permanecer acessiveis');
  assert.equal(grupos[1].itens.length, 1, 'empreendimentos diferentes nao podem ser fundidos pela coordenada');
  assert.deepEqual(grupos[0].ll, [-23.60, -46.66]);

  const mapa = design.match(/\n  syncListaMapa\(\) \{([\s\S]*?)\n  \}\n  checkDemo\(\)/)?.[1] || '';
  assert.match(mapa, /grupo\.ll\.join\(','\)/, 'a assinatura deve reagir a mudancas de latitude e longitude');
  assert.match(mapa, /grupo\.itens\.length/, 'a assinatura e o pin devem reagir a quantidade de unidades');
  assert.match(mapa, /this\.pinIcon\(34, qtd\)/, 'o pin deve exibir a quantidade agregada');
  assert.match(mapa, /mk\.bindPopup\(painel/, 'o pin deve abrir a lista navegavel de unidades');
  assert.match(mapa, /max-height:260px;overflow-y:auto/, 'grupos grandes devem ter rolagem interna');
  assert.match(mapa, /this\.abrirDetalhe\(r\)/, 'cada unidade listada deve preservar a abertura do detalhe');
  assert.match(mapa, /qtd === 1[\s\S]*?this\.abrirDetalhe\(grupo\.itens\[0\]\)/, 'pin de uma unidade deve manter abertura direta como antes');
  assert.match(mapa, /minWidth:\s*220,[\s\S]*?maxWidth:\s*300/, 'popup deve caber em telas pequenas');
  assert.match(mapa, /e\.key === ' '/, 'marcadores devem responder tambem a tecla Espaco');
  assert.match(mapa, /setAttribute\('aria-label', ariaLabel\)/, 'o pin deve ter nome acessivel e contagem');
  assert.match(design, /const temContagem = total != null;/, 'o badge deve aparecer somente nos pins agrupados da lista');
  assert.match(design, /this\.pinIcon\(36\)/, 'o mapa da ficha deve preservar o pin simples, sem badge artificial');
});

test('mapa explica a diferença entre imóveis, pontos agrupados e coordenadas ausentes', async () => {
  const design = await readFile('design/Site ApeCerto.dc.html', 'utf8');
  const gruposTrecho = design.match(/\n  gruposMapa\(rows\) \{([\s\S]*?)\n  \}\n  resumoRepresentacaoMapa\(rows\)/);
  const resumoTrecho = design.match(/\n  resumoRepresentacaoMapa\(rows\) \{([\s\S]*?)\n  \}\n  carregarLeaflet\(\)/);
  assert.ok(gruposTrecho && resumoTrecho, 'o resumo do mapa deve permanecer isolado e testável');
  const gruposMapa = new Function('rows', gruposTrecho[1]);
  const resumoRepresentacaoMapa = new Function('rows', resumoTrecho[1]);
  const contexto = {
    coordenadas: r => Number.isFinite(Number(r.latitude)) && Number.isFinite(Number(r.longitude)) ? [Number(r.latitude), Number(r.longitude)] : null,
    empreendimentoId: r => r.empreendimento_id || null,
    contarResultadosSemCoordenadas: rows => rows.filter(r => r.latitude == null || r.longitude == null).length,
    gruposMapa,
  };
  const rows = Array.from({ length: 19 }, (_, indice) => ({
    id: 'u' + indice,
    empreendimento_id: indice < 2 ? 'e0' : indice < 4 ? 'e1' : 'e' + indice,
    latitude: -23.6 - indice / 10000,
    longitude: -46.66 - indice / 10000,
  }));
  const agrupado = resumoRepresentacaoMapa.call(contexto, rows);
  assert.deepEqual(agrupado, { total: 19, semLocalizacao: 0, representados: 19, pontos: 17, agrupados: 2 });
  const ausente = resumoRepresentacaoMapa.call(contexto, rows.concat({ id: 'sem-local', empreendimento_id: 'e20', latitude: null, longitude: null }));
  assert.equal(ausente.semLocalizacao, 1);
  assert.equal(ausente.representados, 19);
  assert.match(design, /Todos os ' \+ mapaRepresentacao\.total \+ ' apês aparecem no mapa em '/);
  assert.match(design, /data-map-representation-status/);
});

test('galeria e filtros devolvem foco e compartilham fechamento seguro', async () => {
  const design = await readFile('design/Site ApeCerto.dc.html', 'utf8');
  assert.match(design, /abrirGaleria\(indice, origem\)/);
  assert.match(design, /this\.galFocusOrigin = \(origem && origem\.currentTarget\) \|\| document\.activeElement/);
  assert.match(design, /galAbre0: e => this\.abrirGaleria\(0, e\)/);
  assert.match(design, /if \(this\.state\.galOn\) \{ e\.preventDefault\(\); this\.fecharGaleria\(\); return; \}/, 'Escape deve usar o mesmo fechamento que restaura o foco');
  assert.match(design, /galFecha: \(\) => this\.fecharGaleria\(\)/, 'o botão deve usar o mesmo fechamento que restaura o foco');
  assert.match(design, /this\.galFocusOrigin && this\.galFocusOrigin\.focus/);
  assert.match(design, /this\.filtrosFocusOrigin = \(e && e\.currentTarget\) \|\| document\.activeElement/);
  assert.match(design, /this\.filtrosFocusOrigin && this\.filtrosFocusOrigin\.focus/);
  assert.match(design, /this\.state\.galOn[\s\S]{0,100}?document\.querySelector\('\[data-gallery-modal\]'\)/, 'a galeria deve participar do trap de foco global');
  assert.match(design, /this\.state\.filtrosOn[\s\S]{0,100}?document\.querySelector\('#filtros-avancados'\)/, 'os filtros devem participar do trap de foco global');
});

test('galeria responde imediatamente e pre-carrega somente as fotos vizinhas', async () => {
  const design = await readFile('design/Site ApeCerto.dc.html', 'utf8');
  const trecho = design.match(/\n  trocarFotoGaleria\(e, fotos, indice\) \{([\s\S]*?)\n  \}\n  galTouchStart/);
  assert.ok(trecho, 'a troca da galeria deve continuar isolada e testável');
  const codigo = trecho[1];
  assert.ok(codigo.indexOf('this.setState({ galIdx: indice, galLoading: true }') < codigo.indexOf('this.prepararFoto('), 'o índice e o loading devem mudar antes de qualquer espera de rede');
  assert.match(codigo, /const proxima = \(indice \+ 1\) % fotos\.length/);
  assert.match(codigo, /const anterior = \(indice - 1 \+ fotos\.length\) % fotos\.length/);
  assert.doesNotMatch(codigo, /Promise\.race|await\s+this\.prepararFoto/, 'a interação não pode aguardar download ou decode');
  assert.match(design, /class="rw-gallery-loading" role="status" aria-live="polite"/);
});

test('home usa busca progressiva e bairros derivados somente do catálogo publicado', async () => {
  const design = await readFile('design/Site ApeCerto.dc.html', 'utf8');
  assert.match(design, /class="rw-hero-advanced"/);
  assert.match(design, /aria-controls="filtros-avancados"[^>]*>Mais filtros<\/button>/);
  assert.match(design, /\n  bairrosPublicados\(\) \{/);
  assert.match(design, /bairros:\s*this\.bairrosPublicados\(\)\.map/);
  assert.doesNotMatch(design, /nome: 'Moema Pássaros'|nome: 'Moema Índios'/, 'a seção não pode manter bairros editoriais sem imóveis reais');
  assert.match(design, /\{\{ b\.contagem \}\}/);
  assert.match(design, /href="\{\{ b\.href \}\}"/);
  assert.match(design, /href:\s*'\/\?bairro=' \+ encodeURIComponent\(b\.nome\)/);
  assert.doesNotMatch(design, /href="#(?:apes|buscar)"/, 'links visíveis de busca não podem fingir uma taxonomia compartilhável');
  const navegacaoReal = design.slice(design.indexOf('seoCols: (() => {'), design.indexOf('\n    };\n  }\n}', design.indexOf('seoCols: (() => {')));
  assert.doesNotMatch(navegacaoReal, /Moema Pássaros|Moema Índios|Vila Nova Conceição|Brooklin|Ibirapuera/, 'a navegação não pode anunciar bairros ausentes da fonte real');
  assert.match(design, /class="rw-search-sara"[^>]*aria-controls="sara-painel"/, 'a busca progressiva deve manter a Sara acessível');
  assert.match(design, /role="region" aria-label="Busca assistida pela Sara"/);
  assert.equal((design.match(/id="sara-painel"/g) || []).length, 1, 'o painel da Sara deve ter um único id acessível');
});

test('conteúdo, portal e ficha não prometem fluxos indisponíveis nem exibem dados enganosos', async () => {
  const design = await readFile('design/Site ApeCerto.dc.html', 'utf8');
  assert.doesNotMatch(design, />Crie seu acesso<\/button>/, 'signup público desativado não pode continuar como ação visível');
  assert.match(design, /O acesso é liberado pela equipe depois do primeiro contato/);
  assert.match(design, /href="https:\/\/wa\.me\/5511980154312\?text=/, 'novo proprietário deve receber orientação acionável em português');
  assert.match(design, /authModo: 'entrar', authErro: null, authMsg: 'Seu cadastro continua preenchido/);
  assert.match(design, /'Sem vaga de garagem'/);
  assert.match(design, /\{ k: 'Vagas', v: this\.numeroPositivo\(det\.vagas\) \? String/);
  assert.match(design, /const local = bairro \? ' em ' \+ bairro : \(cidade \? ' em ' \+ cidade : ''\)/, 'título e subtítulo não devem repetir cidade');
  assert.doesNotMatch(design, /Por que alugar com a apêcerto\?|Documentos pra alugar|Caução, fiador ou seguro-fiança\?/, 'o conteúdo principal deve refletir a jornada de compra publicada');
});

test('anunciar começa pela captação e só exige conta para enviar', async () => {
  const design = await readFile('design/Site ApeCerto.dc.html', 'utf8');
  assert.match(design, /if \(cadastro\) \{[\s\S]*tela: 'wizard'/);
  assert.match(design, /if \(!this\.state\.sess\) \{[\s\S]*rotaPendente: 'captacao-finalizar'/);
  assert.match(design, /pendente === 'captacao-finalizar'\) this\.enviarCaptacao\(\)/);
  assert.match(design, /sc-camel-on-click="\{\{ abreCadastro \}\}" hint-size="220px,48px">Anunciar meu apê/);
});

test('mapa sem coordenadas mostra estado honesto em vez de uma tela vazia', async () => {
  const design = await readFile('design/Site ApeCerto.dc.html', 'utf8');
  assert.match(design, /mapaTemPontos: mapaRepresentacao\.pontos > 0/);
  assert.match(design, /mapaSemPontos: mapaRepresentacao\.pontos === 0/);
  assert.match(design, /Mapa temporariamente sem pontos/);
  assert.match(design, /A localização pública precisa ser cadastrada em Produtos/);
  assert.match(design, /<sc-if value="\{\{ mapaTemPontos \}\}"[\s\S]{0,1200}?class="rw-dividida"[\s\S]{0,1200}?>Mapa<\/button>/, 'Mapa e Dividida só podem aparecer quando houver pontos reais');
});

test('crédito do mapa preserva o OpenStreetMap sem exibir a marca visual do Leaflet', async () => {
  const design = await readFile('design/Site ApeCerto.dc.html', 'utf8');
  assert.equal(
    (design.match(/attributionControl\.setPrefix\(false\)/g) || []).length,
    2,
    'a lista e a ficha devem remover apenas o prefixo visual da biblioteca Leaflet',
  );
  assert.equal(
    (design.match(/https:\/\/www\.openstreetmap\.org\/copyright/g) || []).length,
    2,
    'o crédito obrigatório do OpenStreetMap deve continuar visível e clicável nos dois mapas',
  );
  assert.match(
    design,
    /#lista-mapa \.leaflet-control-attribution,[\s\S]*?#det-mapa \.leaflet-control-attribution[\s\S]*?border-radius:\s*var\(--radius-pill\)/,
    'a atribuição deve seguir o estilo discreto do site sem ser ocultada',
  );
});

test('build aplica a camada de producao e tracking', async () => {
  const { out } = await pacotePublicado();
  const design = await readFile('design/Site ApeCerto.dc.html', 'utf8');
  const analytics = await readFile('dist/' + await assetPublicado('assets/analytics.js'), 'utf8');
  const productionCss = await readFile('dist/' + await assetPublicado('assets/production.css'), 'utf8');
  const landingOwner = await readFile('static/avaliacao-imovel-moema/index.html', 'utf8');
  const siteTrack = await readFile('supabase/functions/site-track/index.ts', 'utf8');
  const crmCapi = await readFile('supabase/functions/crm-capi/index.ts', 'utf8');
  assert.ok(analytics.includes('G-P63KVXKJDH'), 'o Analytics deve estar ligado ao site');
  assert.ok(analytics.includes('y3rdh7jjn5'), 'o Clarity deve estar ligado ao site');
  assert.ok(analytics.includes("window.clarity('consentv2'"), 'o Clarity deve respeitar consentimento');
  assert.ok(analytics.includes('/functions/v1/site-track'), 'a telemetria first-party sem cookie deve estar ligada');
  assert.ok(analytics.includes("firstPartyTrack('page_view'"), 'a pagina deve registrar visualizacao anonima');
  assert.ok(analytics.includes('apecertoLeadTracking'), 'a origem deve acompanhar o lead ate o CRM');
  assert.ok(analytics.includes('apecertoSubmitSiteLead'), 'todos os formularios devem usar a porta unica de leads');
  assert.ok(analytics.includes("/rest/v1/site_leads"), 'a porta unica deve gravar no contrato canonico');
  assert.ok(analytics.includes("ATTRIBUTION_KEY = 'apecerto_attribution_v3'"), 'a atribuicao deve usar o contrato v3');
  assert.ok(analytics.includes("attribution: { first: first, last: last, current: current }"), 'first, last e current touch devem acompanhar o lead');
  assert.ok(analytics.includes("window.gtag('get', MEASUREMENT_ID, 'client_id'"), 'o GA client_id consentido deve acompanhar o lead');
  assert.ok(analytics.includes("window.gtag('get', MEASUREMENT_ID, 'session_id'"), 'o GA session_id consentido deve acompanhar o lead');
  assert.ok(analytics.includes('window.APECERTO_TRACKING_CONFIG'), 'labels de conversao do Google Ads devem ser configuraveis sem alterar o runtime');
  assert.ok(analytics.includes('/^[A-Za-z0-9_-]+$/.test(label)'), 'labels de conversao invalidos nao podem ser enviados');
  assert.ok(analytics.includes("schedule_complete: 'Schedule'"), 'visita concluida deve usar o evento deduplicado de agendamento');
  assert.ok(analytics.includes("owner_cta_click: 'OwnerIntent'"), 'intencao do proprietario deve espelhar o contrato da CAPI');
  assert.ok(!analytics.includes("cta_click: 'Schedule'"), 'mero clique no CTA nao pode virar conversao de agendamento');
  assert.ok(analytics.includes("sessionStorage.getItem(SESSION_KEY)"), 'a sessao propria deve durar somente a aba do navegador');
  assert.ok(analytics.includes("Math.floor(capturedAt / 1000)"), 'o fbc reconstruido deve manter o instante original do clique');
  assert.ok(analytics.includes("data-consent=\"analytics\""), 'Analytics deve ter consentimento separado');
  assert.ok(analytics.includes("data-consent=\"all\""), 'marketing deve exigir aceite explicito');
  assert.ok(analytics.includes('apecerto-consent-settings'), 'o visitante deve conseguir reabrir as preferencias de privacidade');
  assert.ok(analytics.includes("window.fbq('consent', 'revoke')"), 'revogar marketing deve interromper explicitamente o Pixel');
  assert.ok(analytics.includes("window.fbq('consent', 'grant')"), 'aceitar marketing deve liberar explicitamente o Pixel');
  assert.ok(!/owner_(?:portal_open|cta_click):\s*'Lead'/.test(analytics), 'abrir o portal ou clicar no CTA nao pode ser contado como Lead na Meta');
  assert.match(analytics, /generate_lead:\s*'Lead'/, 'somente o envio concluido deve alimentar a conversao Lead');
  assert.match(analytics, /ADS_CONVERSION_LABELS\s*=\s*\{[\s\S]*generate_lead:\s*'anMDCOmFieQcEI7398BE'/, 'o envio concluido deve alimentar a conversao principal do Google Ads');
  assert.match(analytics, /event_callback:\s*function\s*\(\)\s*\{\s*finish\(true\);\s*\}/, 'o Google Ads deve confirmar o beacon antes de liberar redirecionamentos');
  assert.match(landingOwner, /await window\.apecertoTrack\('generate_lead'/, 'a landing deve aguardar a conversao antes de abrir o WhatsApp');
  assert.ok(analytics.includes('transaction_id: clean(eventId, 120)'), 'a conversao do Google Ads deve ser deduplicada pelo event_id');
  assert.ok(analytics.includes("window.gtag('set', 'user_data'"), 'conversoes otimizadas devem receber os dados consentidos do lead');
  assert.ok(analytics.includes("eventName === 'page_view' || !window.apecertoGtmGa4Managed"), 'o GTM deve assumir os eventos do GA4 sem duplicar page_view');
  assert.ok(analytics.includes('window.apecertoGtmAdsManaged'), 'o GTM deve assumir a conversao do Google Ads com fallback direto');
  assert.match(analytics, /ATTRIBUTION_EVENT_KEYS\s*=\s*\[[\s\S]*?'campaign_id'[\s\S]*?'adset_id'[\s\S]*?'ad_id'/, 'GA, Meta e o banco devem receber a hierarquia completa da campanha');
  assert.doesNotMatch(analytics, /owner_(?:portal_open|cta_click):\s*'anMDCOmFieQcEI7398BE'/, 'clique ou abertura nao pode virar conversao do Google Ads');
  assert.ok(out.includes('GTM-524TZP8X'), 'o Tag Manager deve estar ligado ao site');
  assert.ok(out.includes('googletagmanager.com/ns.html?id=GTM-524TZP8X'), 'o fallback noscript do Tag Manager deve estar no shell publico');
  assert.ok(out.includes('id="apecerto-gtm-deferred"'), 'o Tag Manager deve esperar a pintura crítica');
  assert.ok(out.includes("['pointerdown','touchstart','keydown']"), 'a tag externa deve esperar a primeira interação real');
  assert.ok(out.includes('setTimeout(start,12000)'), 'a tag externa deve ter fallback tardio para visitas sem interação');
  assert.doesNotMatch(out, /requestIdleCallback\(load/, 'uma janela ociosa logo após a carga não pode antecipar meio megabyte de tags');
  assert.ok(analytics.includes('function scheduleGoogleTagFallback()'), 'o gtag direto deve existir somente como contingência');
  assert.ok(analytics.includes('function requestGtmNow()'), 'o consentimento e as conversões críticas devem conseguir antecipar o GTM');
  assert.match(analytics, /if \(consent\.marketing\) \{[\s\S]*?requestGtmNow\(\);[\s\S]*?loadMetaPixel\(\);/, 'aceitar marketing deve iniciar o GTM antes das demais tags');
  assert.match(analytics, /\^\(generate_lead\|schedule_complete\|whatsapp_click\|phone_click\)\$[\s\S]*?requestGtmNow\(\)/, 'conversões críticas devem confirmar o transporte Google antes da saída');
  assert.ok(analytics.includes("if (!gtmContainerReady()) loadGoogleTag();"), 'a contingência não pode duplicar o contêiner saudável');
  assert.ok(analytics.includes('window.apecertoGtmLoadFailed || !window.apecertoGtmLoading'), 'a contingência não pode competir com uma requisição GTM ainda em andamento');
  assert.doesNotMatch(analytics, /\n\s*loadGoogleTag\(\);\n\s*var storedConsent/, 'o gtag direto não pode competir com o GTM no início');
  assert.ok(out.includes('id="apecerto-recovery-scrub"'), 'tokens de recuperacao devem ser retirados da URL antes do tracking');
  assert.ok(
    out.indexOf('id="apecerto-recovery-scrub"') < out.indexOf('googletagmanager.com/gtm.js'),
    'a limpeza do token deve acontecer antes de qualquer tag externa',
  );
  assert.ok(analytics.includes('event_source_url: safePageUrl()'), 'a Meta nao pode receber fragmentos ou parametros de autenticacao');
  assert.ok(analytics.includes('page_location: safePageUrl()'), 'o Analytics nao pode receber fragmentos ou parametros de autenticacao');
  assert.ok(!analytics.includes('event_source_url: location.href'), 'a CAPI nao pode receber a URL bruta do navegador');
  assert.ok(!analytics.includes('page_location: location.href'), 'o GA nao pode receber a URL bruta do navegador');
  assert.match(out, /\/assets\/analytics\.[a-f0-9]{12}\.js/, 'o runtime de tracking deve ser carregado com nome imutavel');
  assert.equal((out.match(/<script src="\/assets\/analytics\.[a-f0-9]{12}\.js" defer><\/script>/g) || []).length, 1, 'o runtime de tracking deve carregar uma unica vez');
  assert.equal((out.match(/googletagmanager\.com\/gtm\.js\?id=/g) || []).length, 1, 'o Tag Manager deve carregar uma unica vez');
  assert.ok(out.includes('11980154312'), 'o WhatsApp oficial deve estar no bundle');
  assert.ok(out.includes("apecertoTrack('generate_lead'"), 'leads devem disparar evento');
  assert.ok(out.includes("apecertoTrack('schedule_complete'"), 'visita gravada deve disparar conclusao de agendamento');
  assert.ok(out.includes("apecertoTrack('financing_open'"), 'abertura do financiamento deve ser medida');
  assert.ok(out.includes("lead_type: 'comprador'"), 'compradores devem ser tipificados');
  assert.ok(out.includes("lead_type: 'financiamento'"), 'pedidos de financiamento devem ser tipificados');
  assert.ok(!out.includes('/rest/v1/site_simulacoes'), 'o financiamento nao pode depender de tabela inexistente');
  assert.ok(!out.includes('Precisamos do seu CPF pra rodar a simulação.'), 'o primeiro contato financeiro nao pode exigir CPF');
  assert.ok(!out.includes('name="cpf"'), 'CPF nao pode ser coletado no formulario publico inicial');
  assert.ok(!out.includes('name="rg"'), 'RG nao pode ser coletado no formulario publico inicial');
  assert.ok(analytics.includes('page_view_id: tracking.page_view_id'), 'o lead deve carregar o identificador efemero da visita');
  assert.ok(analytics.includes("event: 'apecerto_event'"), 'cada evento deve entrar no dataLayer padronizado do GTM');
  assert.ok(analytics.includes("apecerto_event_id: eventId"), 'Pixel e CAPI devem compartilhar o identificador de deduplicacao');
  assert.ok(analytics.includes("window.apecertoTrack('form_submit_attempt'"), 'tentativas de envio devem ser observaveis');
  assert.ok(analytics.includes("window.apecertoTrack('form_error'"), 'erros de formulario devem ser observaveis');
  assert.ok(analytics.includes("window.apecertoTrack('engagement_time'"), 'tempo ativo deve ser medido por faixas');
  assert.ok(analytics.includes("['pushState']"), 'navegacao SPA deve observar apenas navegacoes reais');
  assert.ok(!analytics.includes("['pushState', 'replaceState']"), 'replaceState interno nao pode inflar page_view');
  assert.ok(analytics.includes("navigation_type: 'spa'"), 'page view virtual deve identificar navegacao SPA');
  assert.ok(analytics.includes('var lastPath = pagePath()'), 'filtros em query string nao podem inflar page_view');
  assert.ok(analytics.includes('pageViewId = makeUuid()'), 'cada pagina virtual deve receber um page_view_id novo');
  assert.ok(analytics.includes('external_id: ensureSessionId() || undefined'), 'Pixel e CAPI devem compartilhar a identidade first-party consentida');
  assert.ok(analytics.includes("'form_id', 'placement', 'tracking_ref'"), 'a referencia e o formulario do link devem sobreviver na atribuicao');
  assert.ok(analytics.includes("'Ref: ' + trackingRef"), 'o WhatsApp deve carregar referencia humana rastreavel');
  assert.ok(siteTrack.includes('"gtm_health"'), 'o GTM deve conseguir deixar prova de saude na telemetria propria');
  assert.ok(crmCapi.includes('tracking_delivery_claim'), 'a CAPI do CRM deve aceitar somente fatos do outbox canonico');
  assert.ok(crmCapi.includes('internal_delivery_required'), 'chamadas publicas nao podem fabricar visita, proposta ou venda');
  assert.ok(crmCapi.includes('meta_lead_id: attribution?.meta_lead_id'), 'o retorno comercial deve carregar o Meta Lead ID canônico');
  assert.ok(crmCapi.includes('adset_name: attribution?.adset_name'), 'o retorno comercial deve preservar o conjunto de anúncios');
  assert.ok(out.includes('data-tracking-form="agendamento"'), 'o abandono do agendamento deve ser classificado corretamente');
  assert.ok(out.includes('data-tracking-form="financiamento"'), 'o abandono do financiamento deve ser classificado corretamente');
  assert.ok(out.includes('data-tracking-form="proprietario"'), 'o abandono da captacao deve ser classificado corretamente');
  assert.ok(out.includes("window.apecertoTrack('schedule_field_select'"), 'data e horario do agendamento devem gerar eventos');
  assert.ok(out.includes("window.apecertoTrack('gallery_interaction', { item_id:"), 'galeria deve carregar o imovel no evento');
  assert.ok(out.includes("window.apecertoTrack('favorite_toggle', { item_id:"), 'favorito deve carregar o imovel no evento');
  assert.ok(design.includes("u.pathname = '/imovel/' + encodeURIComponent(this.slugParte(r.slug || r.codigo || r.id)) + '/';"), 'cada unidade deve ter URL limpa e compartilhavel pelo slug ou codigo unico');
  assert.ok(analytics.includes("/^(gallery_interaction|favorite_toggle|whatsapp_click|phone_click|schedule_start"), 'WhatsApp e demais intencoes devem herdar o imovel aberto');
  assert.ok(!analytics.includes("/favorit/i.test(label)"), 'o filtro Favoritos nao pode virar falso AddToWishlist');
  assert.ok(analytics.includes('unidade_id: uuidOrNull(source.unidade_id)'), 'o lead deve preservar a unidade real selecionada');
  assert.ok(analytics.includes("classList.add('apecerto-consent-open')"), 'o aviso de privacidade deve sinalizar sua abertura');
  assert.ok(productionCss.includes('html.apecerto-consent-open a[aria-label="Chamar no WhatsApp"]'), 'o WhatsApp flutuante nao pode cobrir o aviso de privacidade');
  assert.ok(out.includes('/functions/v1/sara-site'), 'a Sara deve consultar a Edge Function');
  assert.ok(out.includes('saraUnidades'), 'o card deve usar os dados da unidade encontrada pela Sara');
  assert.ok(out.includes('saraEmpreendimentoIds: paisSara'), 'a resposta da Sara deve carregar todos os pais correspondentes');
  assert.ok(out.includes('const ordemSara = new Map'), 'os cards devem preservar a ordem de preço devolvida pela Sara');
  assert.ok(out.includes('(saraAtiva || dormOk(r))'), 'a lista deve confiar nos dormitorios por unidade validados pela Sara');
  assert.ok(out.includes('(saraAtiva || vagasOk(r))'), 'a lista nao deve eliminar o resultado por dados agregados do empreendimento');
  assert.ok(out.includes('data-clarity-mask'), 'areas sensiveis devem estar mascaradas');
  assert.ok(out.includes('<html lang="pt-BR">'), 'o idioma deve estar definido');
  assert.ok(out.includes('<link rel="canonical" href="https://apecerto.com/">'), 'a canonical deve existir');
  assert.ok(!out.includes('CRECI-SP 00000-J'), 'o placeholder de CRECI nao pode ir para producao');
  assert.ok(!out.includes('CNPJ 00.000.000/0001-00'), 'o placeholder de CNPJ nao pode ir para producao');
});

test('Sara recomenda todas as unidades publicadas e preserva tipologias comerciais', async () => {
  const edge = await readFile('supabase/functions/sara-site/index.ts', 'utf8');
  assert.ok(edge.includes('.map((unit) => ({ row, price:'), 'a busca não pode reduzir cada prédio à unidade mais barata');
  assert.ok(edge.includes('unitBedrooms(unit) ?? (row.dormitorios'), 'tipologias como Garden e R2V devem usar dormitórios do empreendimento como fallback');
  assert.ok(edge.includes("(unitBedrooms(match.unit) ?? match.row.dormitorios)"), 'a resposta deve devolver os dormitórios efetivamente usados no filtro');
  assert.ok(edge.includes('"apês"}: ${summary}.'), 'a resposta deve separar a quantidade dos filtros com dois-pontos');
  assert.ok(!edge.includes('"apês"} com ${summary}.'), 'a Sara não pode responder “com para comprar” ou “com para alugar”');
});

test('leads de visita e financiamento preservam empreendimento e unidade sem retry de POST', async () => {
  const version = JSON.parse(await readFile('dist/version.json', 'utf8'));
  const html = await readFile('dist/' + version.templatePath.replace(/^\/+/, ''), 'utf8');
  const trecho = (inicio, fim) => {
    const a = html.indexOf(inicio);
    const b = html.indexOf(fim, a + inicio.length);
    assert.ok(a >= 0 && b > a, inicio + ' deve existir no template final');
    return html.slice(a, b);
  };
  const visita = trecho('  async leadEnviar() {', '  async compartilhar() {');
  const financiamento = trecho('  async fichaEnviar() {', '  similares(det) {');

  for (const [nome, metodo] of [['visita', visita], ['financiamento', financiamento]]) {
    assert.ok(metodo.includes('this.empreendimentoId(det)'), nome + ' deve resolver a FK do empreendimento');
    assert.ok(metodo.includes('this.unidadeId(det)'), nome + ' deve resolver a unidade selecionada');
    assert.doesNotMatch(metodo, /empreendimento_id:\s*det(?:\s*\?|\.)/, nome + ' não pode usar o ID visual como FK');
    assert.doesNotMatch(metodo, /\/rest\/v1\/site_leads|fetch\s*\(/, nome + ' não pode manter POST alternativo ou retry automático');
  }
  assert.equal((visita.match(/empreendimento_id: empreendimentoId/g) || []).length, 2, 'visita deve enviar empreendimento no topo e no contexto');
  assert.equal((visita.match(/unidade_id: unidadeId/g) || []).length, 2, 'visita deve enviar unidade no topo e no contexto');
  assert.equal((visita.match(/apecertoSubmitSiteLead\s*\(/g) || []).length, 1, 'visita deve fazer uma única tentativa explícita');
  assert.match(visita, /registrarErro\('lead_comprador', e\)/, 'visita deve registrar a falha antes de liberar retry manual');

  assert.equal((financiamento.match(/empreendimento_id: empreendimentoId/g) || []).length, 1, 'financiamento deve enviar o empreendimento uma vez no contrato dedicado');
  assert.equal((financiamento.match(/unidade_id: unidadeId/g) || []).length, 1, 'financiamento deve enviar a unidade uma vez no contrato dedicado');
  assert.equal((financiamento.match(/apecertoSubmitFinancingLead\s*\(/g) || []).length, 1, 'financiamento deve fazer uma única tentativa explícita');
  assert.doesNotMatch(financiamento, /apecertoSubmitSiteLead\s*\(/, 'financiamento não pode voltar à porta REST genérica');
  assert.match(financiamento, /registrarErro\('lead_financiamento', e, e && e\.status\)/, 'financiamento deve registrar a falha sanitizada antes do retry manual');
});

test('telemetria sem cookie minimiza dados e tem retencao', async () => {
  const fn = await readFile('supabase/functions/site-track/index.ts', 'utf8');
  const migration = await readFile('supabase/migrations/20260817210000_site_telemetry_and_crm_attribution.sql', 'utf8');
  const identityMigration = await readFile('supabase/migrations/20260819110632_tracking_identity_attribution.sql', 'utf8');
  const unifiedLeadMigration = await readFile('supabase/migrations/20260819112719_unify_site_leads_crm.sql', 'utf8');
  assert.ok(fn.includes('ALLOWED_EVENTS'), 'eventos devem usar lista permitida');
  assert.ok(fn.includes('ALLOWED_PROPERTY_KEYS'), 'propriedades devem usar lista permitida');
  assert.ok(!fn.includes('p_ip:'), 'IP nao pode ser enviado para a base analitica');
  assert.ok(migration.includes("interval '90 days'"), 'eventos devem expirar em 90 dias');
  assert.ok(migration.includes("interval '48 hours'"), 'hash de rate limit deve expirar em 48 horas');
  assert.ok(migration.includes('revoke all on table private.site_events_anon'), 'eventos nao podem ser expostos ao navegador');
  assert.ok(migration.includes('site_lead_sync_crm'), 'leads do site devem entrar no CRM');
  assert.ok(fn.includes('site_event_ingest_v2'), 'a telemetria deve usar o contrato com sessao consentida');
  assert.ok(fn.includes('consentLevel !== "essential"'), 'sessao nao pode ser aceita como telemetria essencial');
  assert.ok(identityMigration.includes('create table if not exists private.lead_attribution'), 'atribuicao normalizada deve usar leads.id como identidade canonica');
  assert.ok(identityMigration.includes('last_session_id uuid'), 'a sessao consentida deve ser vinculada ao lead');
  assert.ok(identityMigration.includes('revoke all on table private.lead_attribution from public, anon, authenticated'), 'atribuicao do lead nao pode ser publica');
  assert.ok(identityMigration.includes("coalesce(extras -> 'site_first_touch', v_first_touch)"), 'o primeiro toque nao pode ser sobrescrito em um lead existente');
  assert.ok(unifiedLeadMigration.includes("lead_type in ('comprador', 'proprietario', 'financiamento')"), 'o banco deve aceitar somente os tres tipos de lead');
  assert.ok(unifiedLeadMigration.includes('captacao_portal_sync_site_lead'), 'captacao de proprietario deve criar lead no CRM');
  assert.ok(unifiedLeadMigration.includes("context - array["), 'o contexto comercial deve usar lista fechada');
  assert.ok(!unifiedLeadMigration.includes("'cpf'"), 'o contrato de contexto nao pode aceitar CPF');
  const policies = await readFile('supabase/migrations/20260817211500_site_telemetry_private_policies.sql', 'utf8');
  assert.ok(policies.includes('to service_role'), 'tabelas privadas devem ter politica somente para o servidor');
});

test('Meta CAPI e versionada e nao transforma clique de proprietario em Lead', async () => {
  const fn = await readFile('supabase/functions/meta-capi/index.ts', 'utf8');
  assert.match(fn, /generate_lead:\s*"Lead"/, 'envio concluido deve gerar Lead na Meta');
  assert.ok(!/owner_(?:portal_open|cta_click):\s*"Lead"/.test(fn), 'clique e abertura nao podem gerar Lead');
  assert.ok(fn.includes('event_id: eventId'), 'Pixel e CAPI devem manter o identificador de deduplicacao');
  assert.ok(fn.includes('consent_marketing !== true'), 'CAPI deve exigir consentimento de marketing');
  assert.ok(fn.includes('"capi_token_missing" }, 503'), 'token ausente deve produzir erro observavel');
});

test('contrato Tracking 360 alimenta a Inteligencia sem expor PII', async () => {
  const migration = await readFile('supabase/migrations/20260820203000_tracking_360_contract.sql', 'utf8');
  assert.ok(migration.includes('tracking_360_snapshot'), 'a Inteligencia deve ter um endpoint agregado estavel');
  assert.ok(migration.includes('form_started_without_lead'), 'abandono de formulario deve ser calculado');
  assert.ok(migration.includes('schedule_started_without_completion'), 'abandono de agendamento deve ser calculado');
  assert.ok(migration.includes('meta_delivery'), 'a saude da entrega para Meta deve estar no contrato');
  assert.ok(migration.includes('crm_attribution'), 'a atribuicao do CRM deve estar no contrato');
  assert.ok(migration.includes('revoke all on function public.tracking_360_snapshot'), 'o snapshot nao pode ser publico');
});

test('Sara do site usa somente catalogo publico e protege a chave da IA', async () => {
  const fn = await readFile('supabase/functions/sara-site/index.ts', 'utf8');
  const migration = await readFile('supabase/migrations/20260817153000_sara_site_rate_limit.sql', 'utf8');
  assert.ok(fn.includes('.from("site_produtos")'), 'a Sara deve consultar a view publica aprovada');
  assert.ok(fn.includes('descricao,unidades_site'), 'a Sara deve receber somente as unidades publicadas pela view canonica');
  assert.ok(!fn.includes('.from("unidades")'), 'a Sara nao pode contornar a aprovacao consultando unidades internas');
  assert.ok(fn.includes('match.unit?.id ?? match.row.id'), 'a Sara deve devolver o id real da unidade selecionada');
  assert.ok(fn.includes('out.finalidade = "aluguel"'), 'a Sara deve distinguir aluguel de venda');
  assert.ok(fn.includes('out.finalidade === "aluguel" ? 500 : 100000'), 'aluguel nao pode herdar o piso de preco de venda');
  assert.ok(fn.includes('purposeMatches'), 'a Sara deve filtrar o catalogo pela finalidade solicitada');
  assert.ok(fn.includes('explicitPurpose'), 'a finalidade da pagina deve prevalecer sobre inferencias da IA');
  assert.ok(fn.includes('sara-infra-v1|${ip}'), 'o limite primario da Sara nao pode depender de client_id controlavel');
  assert.ok(fn.includes('p_limit: 60'), 'a Sara deve limitar tambem o IP de infraestrutura');
  assert.ok(fn.includes('!origin || !ALLOWED_ORIGINS.has(origin)'), 'a Edge da Sara deve rejeitar chamadas sem origem do site');
  assert.ok(fn.includes('units: Object.fromEntries'), 'a resposta deve incluir area, dormitorios e vagas da unidade encontrada');
  assert.ok(fn.includes('Deno.env.get("OPENAI_API_KEY")'), 'a chave deve existir somente no servidor');
  assert.ok(!fn.includes('service_role='), 'a service role nao pode estar hardcoded');
  assert.ok(migration.includes('grant execute on function public.sara_site_rate_check'), 'a funcao deve ter rate limit persistente');
  assert.ok(migration.includes('to service_role'), 'somente o servidor pode executar o rate limit');
});

test('build publica landings, privacidade e arquivos de busca', async () => {
  for (const path of [
    'dist/avaliacao-imovel-moema/index.html',
    'dist/imoveis-moema/index.html',
    'dist/privacidade/index.html',
    'dist/robots.txt',
    'dist/sitemap.xml',
    'dist/sitemap-catalogo.xml',
    'dist/sitemap-static.xml',
    'dist/404.html',
  ]) assert.ok(await existe(path), path + ' deve existir');
  const sitemapIndex = await readFile('dist/sitemap.xml', 'utf8');
  assert.ok(sitemapIndex.includes('<sitemapindex'), 'o sitemap publico deve ser um indice fisico');
  assert.ok(sitemapIndex.includes('<loc>https://apecerto.com/sitemap-catalogo.xml</loc>'), 'o indice deve apontar para o catalogo pre-renderizado');
  const catalog = await readFile('dist/sitemap-catalogo.xml', 'utf8');
  assert.ok(catalog.includes('<urlset'), 'o catalogo pre-renderizado deve ser um sitemap fisico');
});

test('rota de campanha abre a landing de captacao, nao a home', async () => {
  const out = await readFile('dist/proprietario/cadastre-seu-imovel/index.html', 'utf8');
  assert.ok(out.includes('id="owner-form"'), 'a rota de campanha deve mostrar o formulario de proprietario');
  assert.ok(out.includes('data-tracking-form="proprietario"'), 'a landing deve classificar o abandono como captacao de proprietario');
  assert.ok(out.includes("lead_type: 'proprietario'"), 'o formulario deve criar lead de proprietario');
  assert.ok(out.includes('apecertoSubmitSiteLead'), 'o formulario deve entrar pela porta canonica do CRM');
  assert.ok(out.includes('<link rel="canonical" href="https://apecerto.com/proprietario/cadastre-seu-imovel/">'), 'a canonical deve apontar para a rota anunciada');
  assert.ok(!out.includes('Apês escolhidos um por um'), 'a rota de campanha nao pode cair na home de compradores');
});
