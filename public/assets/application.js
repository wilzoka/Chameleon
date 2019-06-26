// Datatable
if ($.fn.dataTable) {
    $.extend(true, $.fn.dataTable.defaults, {
        language: {
            search: ''
            , paginate: {
                next: 'Próximo'
                , previous: 'Anterior'
            }
            , sInfo: '_TOTAL_ Registros'
            , sInfoEmpty: ''
            , sInfoFiltered: '(filtrado de _MAX_ registros)'
            , sLengthMenu: '_MENU_'
            , sLoadingRecords: 'Carregando...'
            , sProcessing: 'Processando...'
            , sSearch: 'Pesquisar: '
            , sZeroRecords: 'Nenhum registro correspondente foi encontrado'
            , sEmptyTable: 'Vazio'
        }
    });
    $.extend(true, $.fn.dataTable.ext.classes, {
        sFilterInput: 'form-control'
    });
    $.fn.dataTable.Buttons.defaults.dom.button.className = 'btn btn-sm'
}
// Dropzone
if (window.Dropzone) {
    Dropzone.autoDiscover = false;
    Dropzone.prototype.defaultOptions.dictCancelUpload = "Cancelar Upload";
    Dropzone.prototype.defaultOptions.dictCancelUploadConfirmation = "Você tem certeza que deseja cancelar este envio?";
    Dropzone.prototype.defaultOptions.dictFallbackMessage = "Seu navegador não suporta fazer upload via drag'n'drop.";
    Dropzone.prototype.defaultOptions.dictFallbackText = "Por favor utilize o formulário abaixo para fazer upload do arquivo como nos velhos tempos.";
    Dropzone.prototype.defaultOptions.dictFileTooBig = "Arquivo é grande demais ({{filesize}}MB). Tamanho máximo: {{maxFilesize}}MB.";
    Dropzone.prototype.defaultOptions.dictInvalidFileType = "Você não pode enviar arquivos deste tipo.";
    Dropzone.prototype.defaultOptions.dictMaxFilesExceeded = "Limite excedido. Este arquivo não será salvo.";
    Dropzone.prototype.defaultOptions.dictRemoveFile = "Remover Arquivo";
    Dropzone.prototype.defaultOptions.dictResponseError = "Servidor respondeu com {{statusCode}} código.";
}
// Global Vars
var maps = [];
var notifications = [];
var searchtimeout = null;
var tables = [];
var dzs = {};
var app = false;
var socket;
// Application
var application = {
    index: function (isAuth) {
        // Menu, Title, Username, Tab
        {
            if (isAuth) {
                $('ul.sidebar-menu').append(localStorage.getItem('menu'));
                $('span.logo-lg').html(localStorage.getItem('descriptionmenu'));
                $('span.logo-mini').html(localStorage.getItem('descriptionmenumini'));
                if ($('.sidebar-menu').find('a[href="' + window.location.pathname + '"]')[0]) {
                    $('section.content-header h1').text($('a[href="' + window.location.pathname + '"]').text());
                }
                var pathname = window.location.pathname;
                pathname = pathname.split('/');
                path = pathname[0] + '/' + pathname[1] + '/' + pathname[2];
                var $menuitem = $('a[href="' + path + '"]');
                if ($menuitem[0]) {
                    $menuitem.parent().addClass('active');
                    $menuitem.parents('li.treeview').addClass('menu-open');
                    $menuitem.parents('ul.treeview-menu').css('display', 'block');
                } else {
                    if (pathname.length == 4) {
                        $menuitem = $('a[href="' + path + '/' + pathname[3] + '"]');
                        $menuitem.parent().addClass('active');
                        $menuitem.parents('li.treeview').addClass('menu-open');
                        $menuitem.parents('ul.treeview-menu').css('display', 'block');
                    }
                }
                $('#appusername').text(localStorage.getItem('username'));
            }
            document.title = $('section.content-header').text() || localStorage.getItem('descriptionmenu') || 'Sistema';
            var pagecookie = Cookies.get(window.location.href) ? JSON.parse(Cookies.get(window.location.href)) : {};
            if ('currentTab' in pagecookie) {
                $('ul.nav a[href="' + pagecookie.currentTab + '"]').tab('show');
            }
        }
        // Events
        {
            $(window).on('resize', function () {
                if ($(window).width() < 768) {
                    $('body').removeClass('sidebar-collapse');
                    Cookies.remove('sidebar-collapse');
                }
            });
            $(window).bind('pageshow', function (event) {
                if (event.originalEvent.persisted || event.persisted) {
                    window.location.reload();
                }
            });
            $(document).on('shown.bs.modal shown.bs.tab', function (e) {
                $.fn.dataTable.tables({ visible: true, api: true }).columns.adjust();
            });
            $(document).on('submit', 'form.xhr', function (e) {
                e.preventDefault();
                var $this = $(this);
                $.ajax({
                    url: $this[0].action
                    , type: 'POST'
                    , dataType: 'json'
                    , data: $this.serialize()
                    , beforeSend: function () {
                        $this.find('button:submit').prop('disabled', true);
                    }
                    , success: function (response) {
                        if (response.success) {
                            if ($this.attr('data-modal') == 'true') {
                                $this.find('div.modal').modal('hide');
                            }
                        }
                        application.handlers.responseSuccess(response);
                    }
                    , error: function (response) {
                        application.handlers.responseError(response);
                    }
                    , complete: function () {
                        setTimeout(function () {
                            $this.find('button:submit').prop('disabled', false);
                        }, 1000);
                    }
                });
            });
            $('a.sidebar-toggle').click(function () {
                if ($('body').hasClass('sidebar-collapse')) {
                    Cookies.remove('sidebar-collapse');
                } else {
                    if ($(window).width() >= 768) {
                        Cookies.set('sidebar-collapse', true);
                    }
                }
                setTimeout(function () {
                    window.dispatchEvent(new Event('resize'));
                }, 350);
            });
            $('#view-return').click(function () {
                if (window.history.length > 1) {
                    window.history.back();
                } else {
                    window.close();
                }
            });
            $(document).ajaxStart(function () {
                $('.pace').removeClass('pace-inactive').addClass('pace-active');
            });
            $(document).ajaxComplete(function (e, xhr) {
                if (xhr.statusText != 'abort') {
                    if (xhr.status == 401 && window.location.pathname != '/login') {
                        window.location.href = '/login';
                    }
                    $('.pace').removeClass('pace-active').addClass('pace-inactive');
                }
            });
            $('.nav-tabs a').click(function (e) {
                application.functions.setPageCookie({
                    currentTab: this.hash
                });
            });
            $('#nav-notification-readall').click(function () {
                application.jsfunction('platform.notification.js_readAll');
            });
            $(document).on('click', 'a.nav-notification-item', function (e) {
                application.jsfunction('platform.notification.js_read', { id: $(this).attr('data-notification-id') });
                e.stopPropagation();
            });
            document.addEventListener('scroll', function (e) {
                if (e.target.className == 'dataTables_scrollBody') {
                    var $table = $(e.target).find('table');
                    var scrollPosition = $(e.target).scrollTop() + $(e.target).height();
                    var scrollHeight = $table.height();
                    if ($table.attr('data-lazycomplete') == 'true') {
                        return;
                    }
                    var lazyloadperc = 0;
                    var totalrows = tables[$table[0].id].rows().count();
                    if (totalrows < 500) {
                        lazyloadperc = 0.9;
                    } else if (totalrows < 1000) {
                        lazyloadperc = 0.95;
                    } else {
                        lazyloadperc = 0.98;
                    }
                    if (scrollPosition / scrollHeight > lazyloadperc) {
                        application.tables.getData($table[0].id);
                    }
                }
            }, true);
            $(document).ready(function () {
                if (localStorage.getItem('msg')) {
                    application.notify.success(localStorage.getItem('msg'));
                    localStorage.removeItem('msg');
                }
            });
        }
        //Filter
        {
            $(document).on('click', 'button.btnfilter', function () {
                var $table = $('#' + $(this).attr('data-table'));
                var $filtermodal = $('#' + $table[0].id + 'filter');
                if ($filtermodal.length) {
                    $filtermodal.modal('show');
                } else {
                    $.ajax({
                        url: '/v/' + $table.attr('data-view') + '/filter'
                        , type: 'GET'
                        , dataType: 'json'
                        , data: {
                            issubview: $table.attr('data-subview') || false
                        }
                        , success: function (response) {
                            if (response.success) {
                                $('body').append(application.modal.create({
                                    id: 'tableview' + response.name + 'filter'
                                    , fullscreen: response.filter.available > 8
                                    , title: 'Filtro'
                                    , body: response.filter.html
                                    , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Cancelar</button> <button type="button" class="btn btncleanfilter btn-default">Limpar</button> <button type="button" class="btn btngofilter btn-primary">Filtrar</button>'
                                    , attr: [
                                        { key: 'data-table', value: 'tableview' + response.name }
                                        , { key: 'data-role', value: 'filter' }
                                    ]
                                }));
                                application.components.renderInside($('#tableview' + response.name + 'filter'));
                                $('#tableview' + response.name + 'filter').modal('show');
                            } else {
                                application.notify.error('Não foi possível carregar o filtro');
                            }
                        }
                    });
                }
            });
            $(document).on('click', 'button.btngofilter', function () {
                var $modal = $(this).closest('div.modal');
                var table = $modal.attr('data-table');

                application.tables.saveFilter(table);
                application.tables.reload(table, true);
                $modal.modal('hide');
            });
            $(document).on('click', 'button.btncleanfilter', function () {
                var $modal = $(this).closest('div.modal');
                application.components.clearInside($modal);
            });
            $(document).on('keydown', '.modal[data-role="filter"]', function (e) {
                if (e.which == 13) {
                    $(this).find('button.btngofilter').trigger('click');
                }
            });
            $(document).on('keydown', '.modal[data-role="filter"]', function (e) {
                if (e.which == 13) {
                    $(this).find('button.btngofilter').trigger('click');
                }
            });
            $(document).on('keyup', '.dt-search', function (e) {
                clearTimeout(searchtimeout);
                searchtimeout = setTimeout(function () {
                    var cookiename = $(this).attr('data-table') + 'fs';
                    var fastsearch = $(this).val();
                    if (fastsearch) {
                        Cookies.set(cookiename, fastsearch);
                    } else {
                        Cookies.remove(cookiename);
                    }
                    application.tables.reload($(this).attr('data-table'), true);
                }.bind(this), 300);
            });
        }
        //Notifications
        {
            if (isAuth) {
                application.notification.call();
            }
        }
        //Socket
        {
            if (isAuth) {
                socket = io({
                    transports: ['websocket']
                });
                socket.on('notification', function (data) {
                    notifications.unshift(data)
                    application.notification.render();
                    if (app) {
                        appPostMessage({ type: 'notification' });
                    }
                });
                socket.on('notification:read', function (data) {
                    application.notification.call();
                });
            }
        }
    }
    , isTableview: false
    , isRegisterview: false
    , components: {
        renderAll: function () {
            application.components.date($('input[data-type="date"]'));
            application.components.datetime($('input[data-type="datetime"]'));
            application.components.time($('input[data-type="time"]'));
            application.components.integer($('input[data-type="integer"]'));
            application.components.decimal($('input[data-type="decimal"]'));
            application.components.autocomplete($('select[data-type="autocomplete"]'));
            application.components.file($('div[data-type="file"]'));
            application.components.georeference($('div[data-type="georeference"]'));
            application.components.table($('table.dataTable'));
        }
        , renderInside: function ($el) {
            application.components.date($el.find('input[data-type="date"]'));
            application.components.datetime($el.find('input[data-type="datetime"]'));
            application.components.time($el.find('input[data-type="time"]'));
            application.components.integer($el.find('input[data-type="integer"]'));
            application.components.decimal($el.find('input[data-type="decimal"]'));
            application.components.autocomplete($el.find('select[data-type="autocomplete"]'));
            application.components.file($el.find('div[data-type="file"]'));
            application.components.georeference($el.find('div[data-type="georeference"]'));
            application.components.table($el.find('table.dataTable'));
        }
        , clearInside: function ($el) {
            $el.find('input[data-type="text"]').val('');
            $el.find('input[data-type="textarea"]').val('');
            $el.find('input[data-type="date"]').val('');
            $el.find('input[data-type="datetime"]').val('');
            $el.find('input[data-type="time"]').val('');
            $el.find('input[data-type="integer"]').val('');
            $el.find('input[data-type="decimal"]').val('');
            $el.find('select[data-type="autocomplete"]').val(null).trigger('change');

            $el.find('input[type="radio"]').filter('[value=""]').prop('checked', true);
        }
        , date: function ($obj) {
            if (application.functions.isMobile()) {
                $obj.mask('00/00/0000');
            } else {
                $obj.datetimepicker({
                    format: 'DD/MM/YYYY'
                    , showClear: true
                    , showTodayButton: true
                    , useCurrent: false
                    , locale: 'pt-br'
                }).on('dp.change', function () {
                    // $(this).blur();
                }).mask('00/00/0000');
            }
        }
        , datetime: function ($obj) {
            if (application.functions.isMobile()) {
                $obj.mask('00/00/0000 00:00');
            } else {
                $obj.datetimepicker({
                    format: 'DD/MM/YYYY HH:mm'
                    , showClear: true
                    , showTodayButton: true
                    , useCurrent: false
                    , locale: 'pt-br'
                }).on('dp.change', function () {
                    // $(this).blur();
                }).mask('00/00/0000 00:00');
            }
        }
        , time: function ($obj) {
            $obj.each(function () {
                $(this).maskMoney({ allowEmpty: true, allowZero: true, allowNegative: true, thousands: '', decimal: ':', precision: 2 });
            });
        }
        , integer: function ($obj) {
            $obj.each(function () {
                $(this).maskMoney({ allowEmpty: true, allowZero: true, allowNegative: true, thousands: '', decimal: '', precision: 0 });
            });
        }
        , decimal: function ($obj) {
            $obj.each(function () {
                var precision = $(this).attr('data-precision');
                $(this).maskMoney({ allowEmpty: true, allowZero: true, allowNegative: true, thousands: '.', decimal: ',', precision: precision });
            });
        }
        , file: function ($obj) {
            var previewTemplate = '<div class="dz-preview dz-file-preview">'
                + '<div class="dz-image">'
                + '<img data-dz-thumbnail />'
                + '</div>'
                + '<div class="dz-details">'
                + '<div class="dz-filename">'
                + '<div class="dz-size"><span data-dz-size></span></div>'
                + '<span data-dz-name></span>'
                + '</div>'
                + '</div>'
                + '<div class="dz-progress">'
                + '<span class="dz-upload" data-dz-uploadprogress></span>'
                + '</div>'
                + '<div class="dz-error-message">'
                + '<span data-dz-errormessage></span>'
                + '</div>'
                + '<div class="dz-success-mark">'
                + '<i class="fa fa-3x fa-check-circle"></i>'
                + '</div>'
                + '<div class="dz-error-mark">'
                + '<i class="fa fa-3x fa-times"></i>'
                + '</div>'
                + '<div class="dz-dldiv col-xs-6 no-padding"><a href="#" target="_blank"><button type="button" class="btn btn-xs btn-block" title="Download"><i class="fa fa-2x fa-download"></i></button></a></div>'
                + '<div class="dz-deldiv col-xs-6 no-padding"><a href="javascript:void(0)" style="color:#e22b2b;"><button type="button" class="btn btn-xs btn-block" title="Excluir" data-dz-remove><i class="fa fa-2x fa-trash-alt"></i></button></a></div>'
                + '</div>';
            $obj.each(function () {
                dzs[$(this).attr('data-name')] = new Dropzone(this, {
                    url: "/file"
                    , init: function () {
                        this.on("sending", function (file, xhr, formData) {
                            formData.append("forcejpg", $(file.previewTemplate.parentElement).attr('data-forcejpg'));
                            formData.append("maxwh", $(file.previewTemplate.parentElement).attr('data-maxwh'));
                        });
                    }
                    , dictDefaultMessage: $(this).attr('data-message') || 'Clique aqui para adicionar arquivos'
                    , previewTemplate: previewTemplate
                    , maxFiles: $(this).attr('data-maxfiles') || null
                    , maxFilesize: $(this).attr('data-sizetotal') || null
                    , acceptedFiles: $(this).attr('data-acceptedfiles') || null
                    , success: function (file, response) {
                        if (file.previewElement) {
                            file.previewElement.classList.add("dz-success");
                        }
                        var $hidden = $(this.element).find('input[type="hidden"]');
                        var value = $hidden.val() ? JSON.parse($hidden.val()) : [];
                        value.push({
                            id: response.data.id
                            , filename: response.data.filename
                            , mimetype: response.data.mimetype
                            , size: response.data.size
                            , type: response.data.type
                        });
                        $hidden.val(JSON.stringify(value));
                        $(file.previewElement).attr('data-id', response.data.id);
                        $(file.previewElement).find('.dz-dldiv').remove();
                        $(file.previewElement).find('.dz-deldiv').removeClass('col-xs-6').addClass('col-xs-12');
                        $(file.previewElement).find('a').attr('href', '/file/' + response.data.id);
                    }
                    , parallelUploads: 1
                    , timeout: null
                });
                dzs[$(this).attr('data-name')].on('addedfile', function (file) {
                    $(file.previewElement).attr('data-id', file.id);
                    $(file.previewElement).find('a').attr('href', file.id ? '/file/' + file.id : 'javascript:void(0)');
                });
                dzs[$(this).attr('data-name')].on('removedfile', function (file) {
                    if (file.accepted) {
                        var fileid = $(file.previewElement).attr('data-id');
                        var $hidden = $(this.element).find('input[type="hidden"]');
                        var value = JSON.parse($hidden.val());
                        for (var i = 0; i < value.length; i++) {
                            if (value[i].id == fileid) {
                                value.splice(i, 1);
                            }
                        }
                        if (value.length > 0) {
                            $hidden.val(JSON.stringify(value));
                        } else {
                            $hidden.val('');
                        }
                    }
                });
                var value = $(this).find('input[type="hidden"]').val();
                var obj = value ? JSON.parse(value) : [];
                for (var i = 0; i < obj.length; i++) {
                    var mockFile = { id: obj[i].id, name: obj[i].filename, size: obj[i].size, type: obj[i].mimetype, accepted: true };
                    dzs[$(this).attr('data-name')].emit("addedfile", mockFile);
                    if (obj[i].mimetype.match(/image.*/)) {
                        dzs[$(this).attr('data-name')].emit("thumbnail", mockFile, '/file/' + obj[i].id);
                    }
                    dzs[$(this).attr('data-name')].emit("complete", mockFile);
                    dzs[$(this).attr('data-name')].files.push(mockFile);
                }
            });
        }
        , georeference: function ($obj) {
            if ($obj.length > 0) {
                var realrender = function ($obj) {
                    var myOptions = {
                        zoom: 3
                        , center: { lat: -16.591987, lng: -50.520225 }
                        , gestureHandling: 'greedy'
                        , disableDefaultUI: true
                    };
                    var dragfunction = function () {
                        this.hidden.val(this.getPosition().lat() + ',' + this.getPosition().lng());
                    }
                    $obj.each(function () {
                        $(this).css('height', '350px');
                        var $hidden = $(this).parent().find('input[type="hidden"]');
                        maps[$hidden.attr('name')] = new google.maps.Map(this, myOptions);
                        maps[$hidden.attr('name')].hidden = $hidden;
                        maps[$hidden.attr('name')].name = $hidden.attr('name');
                        if ($hidden.val()) {
                            maps[$hidden.attr('name')].marker = new google.maps.Marker({
                                position: new google.maps.LatLng($hidden.val().split(',')[0], $hidden.val().split(',')[1])
                                , map: maps[$hidden.attr('name')]
                                , hidden: $hidden
                                , draggable: true
                            });
                            google.maps.event.addListener(maps[$hidden.attr('name')].marker, 'dragend', dragfunction);
                            maps[$hidden.attr('name')].setCenter(new google.maps.LatLng($hidden.val().split(',')[0], $hidden.val().split(',')[1]));
                            maps[$hidden.attr('name')].setZoom(15);
                        } else {
                            maps[$hidden.attr('name')].marker = null;
                        }
                        google.maps.event.addListener(maps[$hidden.attr('name')], 'click', function (e) {
                            if (this.marker) {
                                this.marker.setPosition(e.latLng);
                                this.marker.hidden.val(this.marker.getPosition().lat() + ',' + this.marker.getPosition().lng());
                            } else {
                                maps[this.name].marker = new google.maps.Marker({
                                    position: e.latLng
                                    , map: maps[this.name]
                                    , hidden: maps[this.name].hidden
                                    , draggable: true
                                });
                                maps[this.name].hidden.val(e.latLng.lat() + ',' + e.latLng.lng());
                                google.maps.event.addListener(maps[this.name].marker, 'dragend', dragfunction);
                            }
                        });
                    });
                }
                if (typeof google === 'object' && typeof google.maps === 'object') {
                    realrender($obj);
                } else {
                    application.jsfunction('platform.config.js_getGoogleMapsKey', {}, function (response) {
                        $.getScript('https://maps.googleapis.com/maps/api/js?key=' + response.data, function () {
                            realrender($obj);
                        });
                    });
                }
            }
        }
        , autocomplete: function ($obj) {
            var resultTemplate = function (state) {
                return $('<span>' + state.text + '</span>');
            }
            var resultSelection = function (state) {
                return $('<span>' + state.text + '</span>').text();
            }
            $obj.each(function () {
                var where = $(this).attr('data-where');
                var needreplace = where && where.indexOf('$parent') >= 0;
                var $modal = $(this).closest('div.modal').attr('data-table');
                if ($modal) {
                    if (needreplace) {
                        where = where.replace(/\$parent/g, application.functions.getId());
                    }
                } else {
                    if (needreplace) {
                        if (application.functions.getUrlParameter('parent')) {
                            where = where.replace(/\$parent/g, application.functions.getUrlParameter('parent'));
                        } else {
                            where = '';
                        }
                    }
                }
                $(this).attr('data-where', where);
                var options = $(this).attr('data-options');
                if (options) {
                    options = options.split(',');
                    var data = [];
                    for (var i = 0; i < options.length; i++) {
                        data.push({
                            id: options[i]
                            , text: options[i]
                        });
                    }
                    $(this).select2({
                        data: data
                        , placeholder: "Selecione"
                        , allowClear: true
                        , language: "pt-BR"
                    }).on('select2:close', function (evt) {
                        $(this).focus();
                    }).on('select2:open', function (e) {
                        // if (application.functions.isMobile()) {
                        //     setTimeout(function () {
                        //         $(document.activeElement).blur();
                        //     }, 10);
                        // }
                    });
                } else {
                    $(this).select2({
                        ajax: {
                            url: '/autocomplete',
                            dataType: 'json',
                            delay: 300,
                            data: function (params) {
                                return {
                                    q: params.term
                                    , page: params.page
                                    , model: $(this).attr('data-model')
                                    , attribute: $(this).attr('data-attribute')
                                    , query: $(this).attr('data-query')
                                    , where: $(this).attr('data-where')
                                };
                            }
                            , processResults: function (response) {
                                return {
                                    results: response.data
                                };
                            }
                        }
                        , placeholder: "Selecione"
                        , allowClear: true
                        , language: "pt-BR"
                        , templateResult: resultTemplate
                        , templateSelection: resultSelection
                    }).on('select2:close', function (evt) {
                        $(this).focus();
                    }).on('select2:open', function (e) {
                        // if (application.functions.isMobile()) {
                        //     setTimeout(function () {
                        //         $(document.activeElement).blur();
                        //     }, 10);
                        // }
                    });
                }
            });
        }
        , table: function ($obj) {
            $obj.each(function () {
                var $this = $(this);
                if ($this.attr('data-view')) {
                    var cacheconfig = localStorage.getItem('DTconfig_' + window.location.pathname + '_' + $this.attr('data-view'));
                    if (cacheconfig) {
                        application.tables.create(JSON.parse(cacheconfig));
                    } else {
                        $.ajax({
                            url: '/v/' + $this.attr('data-view') + '/config'
                            , type: 'GET'
                            , dataType: 'json'
                            , data: {
                                issubview: $this.attr('data-subview') || false
                            }
                            , success: function (response) {
                                localStorage.setItem('DTconfig_' + window.location.pathname + '_' + $this.attr('data-view'), JSON.stringify(response));
                                application.tables.create(response);
                            }
                            , error: function (response) {
                                if (response.status == '403') {
                                    $this.parent().addClass('text-center').append('<i class="fa fa-lock fa-2x" aria-hidden="true"></i>');
                                    $this.remove();
                                } else {
                                    application.notify.error(response);
                                }
                            }
                        });
                    }
                }
            });
        }
    }
    , tables: {
        create: function (data) {
            // Renders
            for (var i = 0; i < data.columns.length; i++) {
                if (data.columns[i].render) {
                    data.columns[i].render = application.tables.renders[data.columns[i].render];
                }
            }
            // Footer
            if (data.footer) {
                $('#tableview' + data.name).append(data.footer);
            }

            var eventButtons = [{
                text: '<i class="fa fa-edit"></i> Editar'
                , className: 'btn-block btn-warning text-left'
                , action: function (e, dt, node, config) {
                    var $table = $('#' + dt.settings()[0].sTableId);
                    var view = $table.attr('data-view');
                    var subview = $table.attr('data-subview');
                    var selected = $table.attr('data-selected');
                    if (selected) {
                        selected = selected.split(',');
                        window.location.href = '/v/' + view + '/' + selected[selected.length - 1] + (subview ? '?parent=' + application.functions.getId() : '');
                    } else {
                        application.notify.warning('Selecione um registro para Editar');
                    }
                }
            }, {
                text: '<i class="fa fa-trash-alt"></i> Excluir'
                , className: 'btn-block btn-danger text-left'
                , action: function (e, dt, node, config) {
                    var $table = $('#' + dt.settings()[0].sTableId);
                    var view = $table.attr('data-view');
                    var selected = $table.attr('data-selected');
                    if (selected) {
                        selected = selected.split(',');
                        var msg = '';
                        if (selected.length > 1) {
                            msg = 'Os registros selecionados serão Excluídos. Continuar?';
                        } else {
                            msg = 'O registro selecionado será Excluído. Continuar?';
                        }
                        application.functions.confirmMessage(msg, function () {
                            $.ajax({
                                url: '/v/' + view + '/delete'
                                , type: 'POST'
                                , dataType: 'json'
                                , data: { ids: selected.join(',') }
                                , success: function (response) {
                                    application.handlers.responseSuccess(response);
                                    if (response.success) {
                                        application.tables.reloadAll();
                                    }
                                }
                                , error: function (response) {
                                    application.handlers.responseError(response);
                                }
                            });
                        });
                    } else {
                        application.notify.error('Selecione um registro para Excluir');
                    }
                }
            }, {
                text: '<i class="fa fa-times"></i> Desmarcar Selecionados'
                , className: 'btn-block btn-info text-left'
                , action: function (e, dt, node, config) {
                    dt.rows({ selected: true }).deselect();
                    var $table = $('#' + dt.settings()[0].sTableId);
                    var $dtSelectCount = $table.closest('.dataTables_wrapper').find('.dt-select-count');
                    $table.attr('data-selected', '');
                    $dtSelectCount.text('');
                    $dtSelectCount.closest('button').removeClass('btn-primary').addClass('btn-default');
                }
            }];
            for (var i = 0; i < data.events.length; i++) {
                if (i == 0) {
                    eventButtons.push({
                        text: ''
                        , className: 'btn-block btn-default dt-button-divisor'
                    });
                }
                eventButtons.push({
                    text: '<i class="' + data.events[i].icon + '"></i> ' + data.events[i].description
                    , className: 'btn-block btn-default text-left'
                    , idevent: data.events[i].id
                    , action: function (e, dt, node, config) {
                        $.ajax({
                            url: '/event/' + config.idevent
                            , type: 'GET'
                            , dataType: 'json'
                            , data: {
                                id: application.functions.getId()
                                , ids: $('#' + dt.settings()[0].sTableId).attr('data-selected')
                                , parent: application.functions.getUrlParameter('parent')
                            }
                            , success: function (response) {
                                application.handlers.responseSuccess(response);
                            }
                            , error: function (response) {
                                application.handlers.responseError(response);
                            }
                        });
                    }
                });
            }

            // Datatable
            $('#tableview' + data.name).attr('data-fastsearch', data.fastsearch || '');
            tables['tableview' + data.name] = $('#tableview' + data.name).DataTable({
                dom: '<"col-xs-6 no-padding"B><"col-xs-6 dt-filter-div no-padding text-right">t<"col-xs-6 dt-info-div no-padding text-left">'
                , buttons: [
                    {
                        extend: 'collection'
                        , text: '<i class="fa fa-chevron-down"></i><span class="dt-select-count"></span>'
                        , className: 'btn-default'
                        , autoClose: true
                        , buttons: eventButtons
                    }
                    , {
                        text: '<i class="fa fa-plus"></i>'
                        , className: 'btn-success'
                        , autoClose: true
                        , action: function (e, dt, node, config) {
                            var $table = $('#' + dt.settings()[0].sTableId);
                            var view = $table.attr('data-view');
                            var subview = $table.attr('data-subview');
                            if (subview && application.functions.getId() == 0) {
                                Cookies.set('subview_redirect', view);
                                $('#form.xhr').submit();
                                setTimeout(function () {
                                    Cookies.remove('subview_redirect');
                                }, 500);
                            } else {
                                window.location.href = '/v/' + view + '/0' + (subview ? '?parent=' + application.functions.getId() : '');
                            }
                        }
                    }
                ]
                , columns: data.columns
                , deferRender: true
                , drawCallback: function (settings) {
                    var $table = $(settings.nTable);
                    var selected = $table.attr('data-selected');
                    if (selected) {
                        selected = selected.split(',');
                        for (var i = 0; i < selected.length; i++) {
                            this.api().row('tr#' + selected[i]).select();
                        }
                    }
                    this.api().columns.adjust();
                    $table.closest('.dataTables_wrapper').find('.dt-info-div').html($table.attr('data-total') + ' Registros');
                }
                , initComplete: function (settings) {
                    application.tables.getData(settings.sTableId);
                    application.tables.reloadFooter(settings.sTableId);
                    var $table = $(settings.nTable);
                    var filter = Cookies.get(settings.sTableId + 'filter');
                    var isFiltered = filter ? true : false;
                    var filterhtml = '<div class="input-group input-group-sm">' +
                        '<input type="text" class="form-control dt-search ' + ($table.attr('data-fastsearch') == '' ? 'hidden' : '') + '" placeholder="' + $table.attr('data-fastsearch') + '" ' +
                        'data-table="' + ($table.attr('id')) + '" value="' + (Cookies.get($table.attr('id') + 'fs') || '') + '"/>' +
                        '<span class="input-group-btn">' +
                        '<button type="button" class="btn btnfilter ' + (isFiltered ? 'btn-primary' : 'btn-default') + '" data-table="' + settings.sTableId + '">' +
                        '<i class="fa fa-search fa-flip-horizontal"></i>' +
                        '</button>' +
                        '</span>' +
                        '</div>';
                    $table.closest('.dataTables_wrapper').find('.dt-filter-div').append(filterhtml);
                    setTimeout(function () {
                        $(document).trigger('app-datatable', this.sTableId);
                        if (!application.functions.isMobile()) {
                            $('#' + this.sTableId).closest('.dataTables_wrapper').find('input.dt-search').select().focus();
                        }
                    }.bind(settings), 250);
                }
                , ordering: false
                , order: []
                , paging: false
                , rowId: 'id'
                , scrollCollapse: true
                , scrollX: true
                , scrollY: application.functions.isMobile() ? '350px' : '500px'
                , select: {
                    style: 'multi'
                    , info: false
                }
                , serverSide: false
                , stateSave: true
            }).on('select', function (e, dt, type, indexes) {
                var $table = $('#' + dt.settings()[0].sTableId);
                var $dtSelectCount = $table.closest('.dataTables_wrapper').find('.dt-select-count');
                var id = '' + dt.rows(indexes).data()[0].id;
                var selected = $table.attr('data-selected') ? $table.attr('data-selected').split(',') : [];
                if (selected.length > 0) {
                    if ($.inArray(id, selected) === -1) {
                        selected.push(id);
                    }
                } else {
                    selected = [id];
                }
                $table.attr('data-selected', selected);
                if (selected.length > 0) {
                    $dtSelectCount.text(' (' + selected.length + ')');
                    $dtSelectCount.closest('button').removeClass('btn-default').addClass('btn-primary');
                } else {
                    $dtSelectCount.text('');
                    $dtSelectCount.closest('button').removeClass('btn-primary').addClass('btn-default');
                }
            }).on('deselect', function (e, dt, type, indexes) {
                var $table = $('#' + dt.settings()[0].sTableId);
                var $dtSelectCount = $table.closest('.dataTables_wrapper').find('.dt-select-count');
                var id = '' + dt.rows(indexes).data()[0].id;
                var selected = $table.attr('data-selected') ? $table.attr('data-selected').split(',') : [];
                if (selected.length > 0) {
                    var index = $.inArray(id, selected);
                    selected.splice(index, 1);
                }
                $table.attr('data-selected', selected);
                if (selected.length > 0) {
                    $dtSelectCount.text(' (' + selected.length + ')');
                    $dtSelectCount.closest('button').removeClass('btn-default').addClass('btn-primary');
                } else {
                    $dtSelectCount.text('');
                    $dtSelectCount.closest('button').removeClass('btn-primary').addClass('btn-default');
                }
            }).on('dblclick', 'tbody tr', function (e) {
                var $table = $(e.delegateTarget);
                var view = $table.attr('data-view');
                var subview = $table.attr('data-subview');
                var tableid = $table[0].id;
                if ($table.attr('data-readonly') == 'true') {
                    return;
                }
                var selected = application.functions.getKeyFromArrayObject(tables[tableid].rows({ selected: true }).data(), 'id');
                if (!application.functions.isMobile()) {
                    var href = '/v/' + view + '/' + tables[tableid].row(this).data().id + (subview ? '?parent=' + application.functions.getId() : '')
                    if (e.ctrlKey || selected.length > 1) {
                        window.open(href);
                    } else {
                        window.location.href = href;
                    }
                }
            });
        }
        , getData: function (idtable) {
            var $table = $('#' + idtable);
            if ($table.attr('data-lazyloading') == 'true') {
                return;
            }
            $.ajax({
                url: '/datatables'
                , type: 'POST'
                , data: $.extend({}, {
                    id: application.functions.getId()
                    , table: $table[0].id
                    , view: $table.attr('data-view')
                    , issubview: $table.attr('data-subview') || false
                    , issubview: $table.attr('data-subview') || false
                    , start: $table.attr('data-start') || 0
                    , length: 50
                })
                , beforeSend: function () {
                    $table.attr('data-lazyloading', 'true');
                }
                , success: function (response) {
                    var $table = $('#' + response.table);
                    if (response.data.length <= 0) {
                        $table.attr('data-lazycomplete', 'true');
                    }
                    $table.attr('data-start', parseInt($table.attr('data-start') || 0) + 50);
                    $table.attr('data-total', response.total);
                    tables[response.table].rows.add(response.data).draw(false);
                }
                , error: function (response) {
                    if (response.statusText != 'abort') {
                        application.handlers.responseError(response);
                    }
                }
                , complete: function () {
                    $table.attr('data-lazyloading', 'false');
                }
            });
        }
        , deselectAll: function (idtable) {
            tables[idtable].rows().deselect();
            $('#' + idtable).attr('data-selected', '');
        }
        , reload: function (idtable, keepSelection) {
            if (!keepSelection) {
                application.tables.deselectAll(idtable);
            }
            $('#' + idtable).attr('data-start', '0').attr('data-lazycomplete', 'false');
            tables[idtable].clear();
            $('.dataTables_scrollBody').scrollTop(0);
            application.tables.getData(idtable);
            application.tables.reloadFooter(idtable);
            $(document).trigger('app-datatable-reload', idtable);
        }
        , reloadAll: function (keepSelection) {
            for (var k in tables) {
                application.tables.reload(k, keepSelection);
            }
        }
        , reloadFooter: function (idtable) {
            $('#' + idtable).find('span.totalize').each(function () {
                var $this = $(this);
                $.ajax({
                    url: '/datatables/sum'
                    , type: 'POST'
                    , dataType: 'json'
                    , data: {
                        id: application.functions.getId()
                        , view: $this.attr('data-view')
                        , idmodelattribute: $this.attr('data-attribute')
                        , issubview: $('#' + idtable).attr('data-subview') || false
                    }
                    , success: function (response) {
                        var $totalize = $('.totalize[data-view="' + response.view + '"][data-attribute="' + response.attribute + '"]');
                        if (response.success) {
                            $totalize.html(response.data);
                        } else {
                            $totalize.html('?');
                        }
                    }
                    , error: function (response) {
                        application.handlers.responseError(response);
                    }
                });
            });
        }
        , renders: {
            boolean: function (value) {
                if (value) {
                    return '<i class="fa fa-check" style="color: green;"></i>';
                } else {
                    return '<i class="fa fa-times" style="color: red;"></i>';
                }
            }
            , booleancircle: function (value) {
                if (value) {
                    return '<i class="fa fa-circle" style="color: green;"></i>';
                } else {
                    return '<i class="fa fa-circle" style="color: red;"></i>';
                }
            }
            , icon: function (value) {
                if (value) {
                    return '<i class="' + value + '"></i>';
                } else {
                    return '';
                }
            }
            , file: function (value) {
                if (value) {
                    var j = JSON.parse(value);
                    if (j[0].mimetype.match(/image.*/)) {
                        return '<img src="/file/' + j[0].id + '" style="max-height: 100px;">';
                    } else if (j[0].type == 'pdf') {
                        return '<i class="fa fa-file-pdf-o"></i>';
                    } else {
                        return '<i class="fa fa-file-o"></i>';
                    }
                } else {
                    return '';
                }
            }
            , url: function (value) {
                if (value) {
                    return '<a target="_blank" href="' + value + '">' + value + '</a>';
                } else {
                    return '';
                }
            }
            , fin_categoria_dc: function (value) {
                if (value == 1) {
                    return '<span class="label label-danger">Débito</span>';
                } else {
                    return '<span class="label label-success">Crédito</span>';
                }
            }
            , progressbar: function (value) {
                var progresstype = '';
                if (value <= 25) {
                    progresstype = 'danger';
                } else if (value < 50) {
                    progresstype = 'yellow';
                } else if (value < 75) {
                    progresstype = 'primary';
                } else {
                    progresstype = 'success';
                }
                return '<div class="progress progress-striped active"><div class="progress-bar progress-bar-' + progresstype + '" style="width: ' + value + '%"></div></div>';
            }

        }
        , saveFilter: function (idtable) {
            var $modal = $('div#' + idtable + 'filter');
            var cookie = [];
            var types = [
                'input[data-type="text"]'
                , 'input[data-type="date"]'
                , 'input[data-type="datetime"]'
                , 'input[data-type="time"]'
                , 'input[data-type="integer"]'
                , 'input[type="radio"]:checked'
                , 'input[data-type="decimal"]'
                , 'select[data-type="autocomplete"]'
            ];
            for (var i = 0; i < types.length; i++) {
                $modal.find(types[i]).each(function () {
                    var $this = $(this);
                    var val = $this.val();

                    if (typeof val == 'object') {
                        if (val.length > 0) {
                            var o = {};
                            var options = '';
                            var optionsarr = $this.select2('data');
                            for (var z = 0; z < optionsarr.length; z++) {
                                options += '<option value="' + optionsarr[z].id + '" selected>' + optionsarr[z].text + '</option>';
                            }
                            o[$this.attr('name')] = { val: val, options: options };
                            cookie.push(o);
                        }
                    } else {
                        if (val) {
                            var o = {};
                            o[$this.attr('name')] = val;
                            cookie.push(o);
                        }
                    }

                });
            }
            var $button = $('button.btnfilter[data-table="' + idtable + '"]');
            if (cookie.length > 0) {
                $button.removeClass('btn-default').addClass('btn-primary');
                Cookies.set($modal[0].id, JSON.stringify(cookie));
            } else {
                $button.removeClass('btn-primary').addClass('btn-default');
                Cookies.remove($modal[0].id);
            }
        }
    }
    , functions: {
        getId: function () {
            return $('#id').val() || undefined;
        }
        , getUrlParameter: function (name) {
            url = window.location.href;
            name = name.replace(/[\[\]]/g, "\\$&");
            var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
                results = regex.exec(url);
            if (!results) return null;
            if (!results[2]) return '';
            return decodeURIComponent(results[2].replace(/\+/g, " "));
        }
        , isMobile: function () {
            if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
                return true;
            }
            return false;
        }
        , confirmMessage: function (msg, functionSuccess) {
            $('.bootbox').modal('hide');
            bootbox.dialog({
                title: 'Atenção'
                , message: msg
                , buttons: {
                    cancel: {
                        label: 'Cancelar'
                        , className: ''
                    }
                    , confirm: {
                        label: 'Sim'
                        , className: 'btn-primary'
                        , callback: function () {
                            functionSuccess();
                        }
                    }
                }
            });
        }
        , focusFirstElement: function ($selector) {
            $selector.find('input,textarea,select,radio').filter(':enabled:visible:first').focus();
        }
        , getCss: function (array) {
            for (var i = 0; i < array.length; i++) {
                $('<link/>', {
                    rel: 'stylesheet', type: 'text/css', href: array[i]
                }).appendTo('head');
            }
        }
        , getJs: function (array) {
            $.ajaxSetup({ cache: true });
            if (array.length > 0) {
                $.getScript(array[0], function () {
                    array.shift();
                    application.functions.getJs(array);
                });
            } else {
                $(document).trigger('app-loadjs');
                $.ajaxSetup({ cache: false });
            }
        }
        , getPageCookie: function () {
            return Cookies.get(window.location.href) ? JSON.parse(Cookies.get(window.location.href)) : {};
        }
        , parseFloat: function (value) {
            if (value == '') {
                return 0.0;
            } else {
                return parseFloat(value.replace(/\./g, '').replace(',', '.'));
            }
        }
        , setPageCookie: function (conf) {
            var pagecookie = application.functions.getPageCookie();
            pagecookie = $.extend(pagecookie, conf);
            Cookies.set(window.location.href, JSON.stringify(pagecookie));
        }
        , getKeyFromArrayObject: function (o, k) {
            var array = [];
            for (var i = 0; i < o.length; i++) {
                array.push(o[i][k]);
            }
            return array;
        }
    }
    , handlers: {
        responseSuccess: function (response) {
            $('div.form-group.has-error').removeClass('has-error');
            if (response.success) {

                if ('localstorage' in response) {
                    var ls = response.localstorage;
                    for (var i = 0; i < ls.length; i++) {
                        localStorage.setItem(ls[i].key, ls[i].value);
                    }
                }

                if ('msg' in response && ('redirect' in response || 'historyBack' in response)) {
                    localStorage.setItem('msg', response.msg);
                }

                if ('historyBack' in response && response.historyBack) {
                    if (window.history.length > 1) {
                        return window.history.back();
                    } else {
                        localStorage.removeItem('msg');
                        window.close();
                    }
                }

                if ('redirect' in response) {
                    if (application.functions.getId() == 0) {
                        window.history.replaceState(null, null, response.redirect);
                    }
                    if ('subview_redirect' in response) {
                        return window.location.href = response.subview_redirect;
                    } else {
                        return window.location.href = response.redirect;
                    }
                }

                if ('msg' in response) {
                    application.notify.success(response.msg);
                }

                if ('openurl' in response) {
                    window.open(response.openurl);
                }

                if ('modal' in response) {
                    if ('form' in response.modal && response.modal.form) {
                        $('body').append('<form class="xhr" autocomplete="off" data-modal="true" action="' + (response.modal.action || '') + '">' + application.modal.create(response.modal) + '</form>');
                    } else {
                        $('body').append(application.modal.create(response.modal));
                    }

                    application.components.renderInside($('#' + response.modal.id));
                    $(document).trigger('app-modal', response.modal);
                    $('#' + response.modal.id).modal('show');
                    $('#' + response.modal.id).on('hidden.bs.modal', function () {
                        if ($(this).parent()[0].tagName == 'BODY') {
                            $(this).remove();
                        } else {
                            $(this).parent().remove();
                        }
                    });
                }

                if ('reloadtables' in response && response.reloadtables) {
                    application.tables.reloadAll();
                }

            } else {

                if ('invalidfields' in response) {
                    for (var i = 0; i < response.invalidfields.length; i++) {
                        $('input[name="' + response.invalidfields[i] + '"]').closest('div.form-group').addClass('has-error');
                        $('select[name="' + response.invalidfields[i] + '"]').closest('div.form-group').addClass('has-error');
                        $('textarea[name="' + response.invalidfields[i] + '"]').closest('div.form-group').addClass('has-error');
                    }
                }

                if ('msg' in response) {
                    application.notify.error(response.msg);
                }

            }
        }
        , responseError: function (response) {
            if (response.status == 0) {
                application.notify.error('Sistema indisponível, tente novamente mais tarde');
            } else if (response.status == 401) {
                application.notify.error('Acesso não autorizado');
            } else {
                if ('msg' in response) {
                    application.notify.error(response.msg);
                } else {
                    application.notify.error('Alguma coisa deu errado :(');
                }
            }
        }
    }
    , modal: {
        create: function (obj) {
            var attr = '';
            if ('attr' in obj) {
                for (var i = 0; i < obj.attr.length; i++) {
                    attr += ' ' + obj.attr[i].key + '="' + obj.attr[i].value + '"';
                }
            }

            var html = '<div class="modal fade" id="' + obj.id + '" ' + attr + '>';
            if (obj.fullscreen) {
                html += '<div class="modal-dialog modal-fullscreen">';
            } else {
                html += '<div class="modal-dialog">';
            }

            html += '<div class="modal-content">';

            html += '<div class="modal-header">';
            html += '<button type="button" class="close" data-dismiss="modal" aria-label="Close">';
            html += '<span aria-hidden="true">×</span></button>';
            html += '<h4 class="modal-title">' + obj.title + '</h4>';
            html += '</div >';

            html += '<div class="modal-body">';
            html += '<div class="row">';
            html += obj.body;
            html += '</div>';
            html += '</div>';

            html += '<div class="modal-footer">';
            html += obj.footer;
            html += '</div>';

            html += '</div>';//modal-content
            html += '</div>';//modal-dialog

            return html;
        }
    }
    , notification: {
        call: function () {
            application.jsfunction('platform.users.js_getNotifications', {}, function (response) {
                if (response.success) {
                    notifications = response.data.notifications;
                    application.notification.render();
                }
            });
        }
        , render: function () {
            var $notificationMenu = $('#nav-notification');
            var $notificationLabel = $('#nav-notification-label');
            var $notificationItemNone = $('#nav-notification-item-none');
            var $notificationMenuUl = $('#nav-notification-menu');
            $notificationMenuUl.find('li').each(function () {
                if ($(this)[0].id != 'nav-notification-item-none') {
                    $(this).remove();
                }
            });
            //Reset
            $notificationLabel.text('');
            $notificationItemNone.removeClass('hidden');
            if (notifications.length > 0) {
                $notificationItemNone.addClass('hidden');
                $notificationLabel.text(notifications.length);
                for (var i = 0; i < notifications.length; i++) {
                    $notificationMenuUl.append(
                        '<li><a href="' + (notifications[i].link || 'javascript:void(0)') + '" class="nav-notification-item" data-notification-id="' + notifications[i].id + '" style="white-space: unset;padding: 15px 10px;">'
                        + '<h4 style="margin: 0;">' + notifications[i].title
                        + '<small style="top: -13px;right: -5px;"><i class="fa fa-clock-o"></i> ' + notifications[i].duration + '</small>'
                        + '</h4>'
                        + '<p style="margin: 0;">' + notifications[i].description + '</p>'
                        + '</a>'
                        + '</li>'
                    );
                }
            }
        }
    }
    , notify: {
        getOptions: function () {
            return {
                element: 'body'
                , position: null
                , type: 'success'
                , allow_dismiss: true
                , newest_on_top: false
                , showProgressbar: false
                , placement: {
                    from: application.functions.isMobile() ? 'top' : 'bottom'
                    , align: 'right'
                }
                , offset: 20
                , spacing: 10
                , z_index: 10310
                , delay: 400
                , timer: 1000
                , animate: {
                    enter: 'animated fadeIn'
                    , exit: 'animated fadeOut'
                }
                , mouse_over: 'pause'
            };
        }
        , success: function (message) {
            $.notify({
                message: message
            }, $.extend(application.notify.getOptions(), { type: 'success', timer: message.length * 50 }));
        }
        , error: function (message) {
            $.notify({
                message: message
            }, $.extend(application.notify.getOptions(), { type: 'error', timer: message.length * 50 }));
        }
        , info: function (message) {
            $.notify({
                message: message
            }, $.extend(application.notify.getOptions(), { type: 'info', timer: message.length * 50 }));
        }
        , warning: function (message) {
            $.notify({
                message: message
            }, $.extend(application.notify.getOptions(), { type: 'warning', timer: message.length * 50 }));
        }
    }
    , route: {
        handler: function (data, func) {
            $.ajax({
                type: 'POST'
                , dataType: 'json'
                , data: data
                , success: function (response) {
                    func(response);
                }
                , error: function (response) {
                    application.handlers.responseError(response);
                }
            });
        }
    }
    , jsfunction: function (name, obj, func) {
        $.ajax({
            url: '/jsfunction'
            , type: 'POST'
            , dataType: 'json'
            , data: {
                name: name
                , data: obj || {}
            }
            , success: function (response) {
                if (func) {
                    func(response);
                }
            }
            , error: function (response) {
                application.handlers.responseError(response);
            }
        });
    }
}

function appReceiveMessage(event) {
    app = event;
}
function appPostMessage(msg) {
    if (app) {
        app.source.postMessage(msg, app.origin);
    }
}
window.addEventListener("message", appReceiveMessage, false);