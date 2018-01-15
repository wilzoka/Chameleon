$(function () {

    $('#z3').append(`
    <div class="col-sm-12">
        <div class="description-block">
            <h5 id="sobra_qtd" class="description-header">0,0000</h5>
            <span>Quantidade</span>
        </div>
    </div>
    `);

    $('input[name="data"]').on('dp.change', function (e) {
        if (e.date) {
            application.jsfunction('sipfinancas.financeiro.conta.js_saldoData', { idconta: application.functions.getUrlParameter('parent'), data: e.date.format('DD/MM/YYYY') }, function (response) {
                if (response.success) {
                    $('input[name="valor"]').val(response.data);
                }
            });
        }
    });

});