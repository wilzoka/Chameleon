$(function () {

    var $idpedidoitem = $('select[name="idpedidoitem"]');
    var $idop = $('select[name="idop"]');

    $idpedidoitem.on('select2:select', function (e) {
        $idop.val(null).trigger("change");
        $idop.attr('data-where', 'id in (select ep.idop from pcp_opep ep left join ven_pedidoitem pi on (ep.idpedido = pi.idpedido) where pi.id = ' + e.params.data.id + ')');
    }).on('select2:unselecting', function (e) {
        $idop.val(null).trigger("change");
        $idop.attr('data-where', '1 != 1');
    });

    if ($idpedidoitem.val()) {
        $idop.attr('data-where', 'id in (select ep.idop from pcp_opep ep left join ven_pedidoitem pi on (ep.idpedido = pi.idpedido) where pi.id = ' + $idpedidoitem.val() + ')');
    }

});