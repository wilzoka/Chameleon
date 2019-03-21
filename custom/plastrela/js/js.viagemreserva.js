$(function () {

    function translate() {
        switch ($('input[name="tipo"]:checked').val()) {
            case 'Passagem Aérea':
                $('input[name="local1"]').siblings('label').html('Origem*');
                $('input[name="data1"]').siblings('label').html('Data Embarque*');
                $('input[name="hora1"]').siblings('label').html('Hora Embarque*');

                $('input[name="local2"]').siblings('label').parent().parent().removeClass('hidden');
                $('input[name="local2"]').siblings('label').html('Destino*');
                $('input[name="data2"]').siblings('label').html('Data Chegada*');
                $('input[name="hora2"]').siblings('label').html('Hora Chegada*');
                break;
            case 'Hospedagem':
                $('input[name="local1"]').siblings('label').html('Local*');
                $('input[name="data1"]').siblings('label').html('Data Check-in*');
                $('input[name="hora1"]').siblings('label').html('Check-in*');

                $('input[name="local2"]').siblings('label').parent().parent().addClass('hidden');
                $('input[name="data2"]').siblings('label').html('Data Check-out*');
                $('input[name="hora2"]').siblings('label').html('Hora Check-out*');
                break;
            case 'Aluguel Carro':
                $('input[name="local1"]').siblings('label').html('Local Retirada*');
                $('input[name="data1"]').siblings('label').html('Data Retirada*');
                $('input[name="hora1"]').siblings('label').html('Hora Retirada*');

                $('input[name="local2"]').siblings('label').parent().parent().removeClass('hidden');
                $('input[name="local2"]').siblings('label').html('Local Devolução*');
                $('input[name="data2"]').siblings('label').html('Data Devolução*');
                $('input[name="hora2"]').siblings('label').html('Hora Devolução*');
                break;
            case 'Translado':
                $('input[name="local1"]').siblings('label').html('Local Origem*');
                $('input[name="data1"]').siblings('label').html('Data Partida*');
                $('input[name="hora1"]').siblings('label').html('Hora Partida*');

                $('input[name="local2"]').siblings('label').parent().parent().removeClass('hidden');
                $('input[name="local2"]').siblings('label').html('Local Destino*');
                $('input[name="data2"]').siblings('label').html('Data Chegada*');
                $('input[name="hora2"]').siblings('label').html('Hora Chegada*');
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