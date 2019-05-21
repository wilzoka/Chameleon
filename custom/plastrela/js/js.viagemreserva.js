$(function () {

    function translate() {
        switch ($('input[name="tipo"]:checked').val()) {
            case 'Passagem Aérea':
                $('input[name="local1"]').siblings('label').html('Origem*');
                $('input[name="data1"]').siblings('label').html('Data Embarque*');
                $('input[name="local2"]').siblings('label').html('Destino*');
                
                $('input[name="local2"]').siblings('label').parent().parent().removeClass('hidden');
                $('input[name="hora1"]').siblings('label').parent().parent().addClass('hidden');
                $('input[name="data2"]').siblings('label').parent().parent().addClass('hidden');
                break;
            case 'Hospedagem':
                $('input[name="local1"]').siblings('label').html('Local*');
                $('input[name="data1"]').siblings('label').html('Check-in*');
                $('input[name="data2"]').siblings('label').html('Check-out*');

                $('input[name="data2"]').siblings('label').parent().parent().removeClass('hidden');
                $('input[name="hora1"]').siblings('label').parent().parent().addClass('hidden');
                $('input[name="local2"]').siblings('label').parent().parent().addClass('hidden');
                break;
            case 'Carro':
                $('input[name="local1"]').siblings('label').html('Local Retirada*');
                $('input[name="data1"]').siblings('label').html('Data Retirada*');
                $('input[name="hora1"]').siblings('label').html('Hora Retirada*');
                $('input[name="local2"]').siblings('label').html('Local Devolução*');
                $('input[name="data2"]').siblings('label').html('Data Devolução*');

                $('input[name="hora1"]').siblings('label').parent().parent().removeClass('hidden');
                $('input[name="local2"]').siblings('label').parent().parent().removeClass('hidden');
                $('input[name="data2"]').siblings('label').parent().removeClass('hidden');
                break;
            case 'Transfer':
                $('input[name="local1"]').siblings('label').html('Origem*');
                $('input[name="data1"]').siblings('label').html('Data*');
                $('input[name="hora1"]').siblings('label').html('Hora*');
                $('input[name="local2"]').siblings('label').html('Destino*');

                $('input[name="local2"]').siblings('label').parent().parent().removeClass('hidden');
                $('input[name="hora1"]').siblings('label').parent().parent().removeClass('hidden');
                $('input[name="data2"]').siblings('label').parent().parent().addClass('hidden');
                break;
        }
    }

    $('input[name="tipo"]').change(function () {
        translate();
    });

    if (application.functions.getId() > 0) {
        translate();
    }

});