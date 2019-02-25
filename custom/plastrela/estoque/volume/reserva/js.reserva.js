$(function () {

    var $idpedidoitem = $('select[name="idpedidoitem"]');
    var $idopetapa = $('select[name="idopetapa"]');

    $idpedidoitem.on('select2:select', function (e) {
        $idopetapa.val(null).trigger("change");
        $idopetapa.attr('data-where', 'id in (select ope.id from pcp_opep ep left join pcp_op op on (ep.idop = op.id) left join pcp_opetapa ope on (ep.idop = ope.idop) left join ven_pedidoitem pi on (ep.idpedido = pi.idpedido) where pi.id = ' + e.params.data.id + ' and pi.idversao = op.idversao)');
    }).on('select2:unselecting', function (e) {
        $idopetapa.val(null).trigger("change");
        $idopetapa.attr('data-where', '1 != 1');
    });

    if ($idpedidoitem.val()) {
        $idopetapa.attr('data-where', 'id in (select ope.id from pcp_opep ep left join pcp_op op on (ep.idop = op.id) left join pcp_opetapa ope on (ep.idop = ope.idop) left join ven_pedidoitem pi on (ep.idpedido = pi.idpedido) where pi.id = ' + $idpedidoitem.val() + ' and pi.idversao = op.idversao)');
    }

});