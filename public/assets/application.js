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
            , sLoadingRecords: '<i class="fas fa-sync fa-spin"></i>'
            , sProcessing: 'Processando...'
            , sSearch: 'Pesquisar: '
            , sZeroRecords: 'Nenhum registro correspondente foi encontrado'
            , sEmptyTable: 'Vazio'
        }
    });
    $.extend(true, $.fn.dataTable.ext.classes, {
        sFilterInput: 'form-control'
    });
    $.fn.dataTable.Buttons.defaults.dom.button.className = 'btn btn-sm';
    $.fn.dataTable.ext.errMode = function (settings, techNote, message) {
        var $table = $('#' + settings.sTableId);
        if (techNote == 4) {//Warning: Requested unknown parameter
            localStorage.removeItem('Vconfig_' + window.location.pathname + '_' + $table.attr('data-view'));
            window.location.reload();
        } else {
            console.log(message);
        }
    };
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
var calendar = null;
var dzs = {};
var wysiwygs = {};
var app = false;
var socket;
var eventFromRegister = false;
// Touch
var longTouchTimer;
function touchStart(func) {
    longTouchTimer = setTimeout(func, 650);
}
function touchEnd() {
    if (longTouchTimer)
        clearTimeout(longTouchTimer);
}
// Application
var application = {
    index: function (isAuth) {
        // Menu, Title, Username, Tab
        {
            if (isAuth) {
                $('ul.sidebar-menu').append(localStorage.getItem('menu'));
                $('span.logo-lg').html(localStorage.getItem('descriptionmenu'));
                $('span.logo-mini').html(localStorage.getItem('descriptionmenumini'));
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
            document.title = $('#title-app').text() || localStorage.getItem('descriptionmenu') || 'Sistema';
            var pageconf = application.functions.getPageConf();
            if ('currentTab' in pageconf) {
                $('ul.nav a[href="' + pageconf.currentTab + '"]').tab('show');
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
                    , data: application.functions.serializeForm($this)
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
            $('li.btn-event').click(function () {
                $.ajax({
                    url: '/event/' + $(this).attr('data-event')
                    , type: 'GET'
                    , dataType: 'json'
                    , data: {
                        id: application.functions.getUrlParameter('parent')
                        , ids: application.functions.getId()
                    }
                    , success: function (response) {
                        eventFromRegister = true;
                        application.handlers.responseSuccess(response);
                    }
                    , error: function (response) {
                        application.handlers.responseError(response);
                    }
                });
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
                application.functions.setPageConf({
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
            $(document).ready(function () {
                if (localStorage.getItem('msg')) {
                    application.notify.success(localStorage.getItem('msg'));
                    localStorage.removeItem('msg');
                }
                if (window.location.pathname == '/login') {
                    localStorage.clear();
                }
            });
        }
        //Filter
        {
            $(document).on('click', 'button.btnfilter', function () {
                var $view = $('#' + $(this).attr('data-view'));
                var $filtermodal = $('#' + $view[0].id + 'filter');
                if ($filtermodal.length) {
                    $filtermodal.modal('show');
                } else {
                    $.ajax({
                        url: '/v/' + $view.attr('data-view') + '/filter'
                        , type: 'GET'
                        , dataType: 'json'
                        , data: {
                            subview: $view.attr('data-subview')
                        }
                        , success: function (response) {
                            if (response.success) {
                                $('body').append(application.modal.create({
                                    id: 'view' + response.name + 'filter'
                                    , fullscreen: response.filter.available > 8
                                    , title: 'Filtro'
                                    , body: response.filter.html
                                    , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Cancelar</button> <button type="button" class="btn btncleanfilter btn-default">Limpar</button> <button type="button" class="btn btngofilter btn-primary">Filtrar</button>'
                                    , attr: [
                                        { key: 'data-view', value: 'view' + response.name }
                                        , { key: 'data-role', value: 'filter' }
                                    ]
                                }));
                                application.components.renderInside($('#view' + response.name + 'filter'));
                                $('#view' + response.name + 'filter').modal('show');
                            } else {
                                application.notify.error('Não foi possível carregar o filtro');
                            }
                        }
                    });
                }
            });
            $(document).on('click', 'button.btngofilter', function () {
                var $modal = $(this).closest('div.modal');
                var view = $modal.attr('data-view');
                application.tables.saveFilter(view);
                application.view.reload(view, true);
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
                    var cookiename = $(this).attr('data-view') + 'fs';
                    var fastsearch = $(this).val();
                    if (fastsearch) {
                        Cookies.set(cookiename, fastsearch, { expires: 0.25 });
                    } else {
                        Cookies.remove(cookiename);
                    }
                    application.view.reload($(this).attr('data-view'), true);
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
                // socket.on('view:reload', function (data) {
                //     application.view.reloadAll(true)
                // });
            }
        }
    }
    , isTableview: false
    , isRegisterview: false
    , ckeditor: {
        config: {
            toolbar: {
                items: [
                    'bold',
                    'italic',
                    'underline',
                    'alignment',
                    '|',
                    'bulletedList',
                    'numberedList',
                    'todoList',
                    '|',
                    'pageBreak',
                    'horizontalLine',
                    '|',
                    'link',
                    'imageUpload',
                    'insertTable',
                    'mediaEmbed',
                    'undo',
                    'redo'
                ]
            },
            language: 'pt-br',
            image: {
                styles: [
                    'alignLeft', 'alignCenter', 'alignRight'
                ],
                toolbar: [
                    'imageStyle:alignLeft', 'imageStyle:alignCenter', 'imageStyle:alignRight'
                    , '|', 'imageTextAlternative'
                ]
            },
            table: {
                contentToolbar: [
                    'tableColumn',
                    'tableRow',
                    'mergeTableCells',
                    'tableCellProperties',
                    'tableProperties'
                ]
            }
        }
    }
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
            application.components.wysiwig($('textarea[data-wysiwyg="true"]'));
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
            application.components.wysiwig($el.find('textarea[data-wysiwyg="true"]'));
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
                + '<div class="dz-dldiv col-xs-6 no-padding"><a href="#" target="_blank"><button type="button" class="btn btn-default btn-xs btn-block" title="Download"><i class="fa fa-2x fa-download" style="color:#2b70dad4;"></i></button></a></div>'
                + '<div class="dz-deldiv col-xs-6 no-padding"><a href="javascript:void(0)" style="color:#e22b2b;"><button type="button" class="btn btn-default btn-xs btn-block" title="Excluir" data-dz-remove><i class="fa fa-2x fa-trash-alt" style="color:#d42727d4;;"></i></button></a></div>'
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
                        //
                        var input = document.getElementById($hidden.attr('name') + '_gms');
                        var searchBox = new google.maps.places.SearchBox(input);
                        setTimeout(function () {
                            $(input).removeClass('hidden');
                        }, 500);
                        maps[$hidden.attr('name')].controls[google.maps.ControlPosition.TOP_LEFT].push(input);
                        searchBox.addListener('places_changed', function () {
                            var places = searchBox.getPlaces();
                            if (places.length == 0) {
                                return;
                            }
                            place = places[0];
                            var bounds = new google.maps.LatLngBounds();
                            if (!place.geometry) {
                                console.log("Returned place contains no geometry");
                                return;
                            }
                            if (maps[$hidden.attr('name')].marker)
                                maps[$hidden.attr('name')].marker.setMap(null);
                            maps[$hidden.attr('name')].marker = new google.maps.Marker({
                                map: maps[$hidden.attr('name')]
                                , hidden: $hidden
                                , draggable: true
                                , position: place.geometry.location
                            });
                            $hidden.val(place.geometry.location.lat() + ',' + place.geometry.location.lng());
                            google.maps.event.addListener(maps[$hidden.attr('name')].marker, 'dragend', dragfunction);
                            if (place.geometry.viewport) {
                                bounds.union(place.geometry.viewport);
                            } else {
                                bounds.extend(place.geometry.location);
                            }
                            maps[$hidden.attr('name')].fitBounds(bounds);
                        });
                        //
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
                        $.getScript('https://maps.googleapis.com/maps/api/js?key=' + response.data + '&libraries=places', function () {
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
                var $modal = $(this).closest('div.modal').attr('data-view');
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
                    });
                }
            });
        }
        , table: function ($obj) {
            $obj.each(function () {
                var $this = $(this);
                if ($this.attr('data-view')) {
                    application.view.getConfig($this.attr('data-view'), function (config) {
                        if (config.success) {
                            application.tables.create(config);
                        } else {
                            if (config.status == '403') {
                                $this.parent().addClass('text-center').append('<i class="fa fa-lock fa-2x" aria-hidden="true"></i>');
                                $this.remove();
                            }
                        }
                    });
                }
            });
        }
        , wysiwig: function ($obj) {
            $obj.each(function () {
                ClassicEditor.create(this, application.ckeditor.config).then(function (editor) {
                    wysiwygs[$(this).attr('name')] = editor;
                }.bind(this));
            });
        }
    }
    , tables: {
        create: function (data) {
            // Renders
            for (var i = 0; i < data.columns.length; i++) {
                if (data.columns[i].render) {
                    data.columns[i].render = application.tables.renders[data.columns[i].render];
                } else {
                    data.columns[i].render = application.tables.renders['div'].bind({ lineheight: data.lineheight || 1 });
                }
            }
            // Footer
            if (data.footer) {
                $('#view' + data.name).append(data.footer);
            }
            // Buttons
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
                        window.location.href = '/v/' + view + '/' + selected[selected.length - 1] + (subview ? '?subview=' + subview + '&parent=' + application.functions.getId() : '');
                    } else {
                        application.notify.warning('Selecione um registro para Editar');
                    }
                }
            }];
            if (data.permissions.deletable) {
                eventButtons.push({
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
                });
            }
            eventButtons.push({
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
            });
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
            var buttons = [{
                extend: 'collection'
                , text: '<i class="fa fa-chevron-down"></i><span class="dt-select-count"></span>'
                , className: 'btn-default'
                , autoClose: true
                , buttons: eventButtons
            }];
            if (data.permissions.insertable) {
                buttons.push({
                    text: '<i class="fa fa-plus"></i>'
                    , className: 'btn-success'
                    , autoClose: true
                    , action: function (e, dt, node, config) {
                        var $table = $('#' + dt.settings()[0].sTableId);
                        var view = $table.attr('data-view');
                        var subview = $table.attr('data-subview');
                        var id = application.functions.getId();
                        var redirect = '/v/' + view + '/0' + (subview ? '?subview=' + subview + (id > 0 ? '&parent=' + id : '') : '');
                        if (subview && ((id == 0 && permission.insertable) || (id > 0 && permission.editable))) {
                            Cookies.set('subview_redirect', redirect);
                            $('#view-submit').trigger('click');
                        } else {
                            window.location.href = redirect;
                        }
                    }
                });
            }
            // Datatable
            $('#view' + data.name).addClass('nowrap');
            $('#view' + data.name).attr('data-fastsearch', data.fastsearch || '');
            tables['view' + data.name] = $('#view' + data.name).DataTable({
                ajax: function (data, callback, settings) {
                    $.ajax({
                        url: '/datasource'
                        , type: 'POST'
                        , data: $.extend({}, data, {
                            id: application.functions.getId()
                            , view: $(settings.nTable).attr('data-view')
                            , subview: $(settings.nTable).attr('data-subview')
                        })
                        , beforeSend: function (jqXHR) {
                            if (tables[settings.sTableId]) {
                                if (tables[settings.sTableId]._xhr) {
                                    tables[settings.sTableId]._xhr.abort();
                                }
                                tables[settings.sTableId]._xhr = jqXHR;
                            }
                        }
                        , success: function (response) {
                            callback(response);
                        }
                        , error: function (response) {
                            if (response.statusText != 'abort') {
                                application.handlers.responseError(response);
                            }
                        }
                    });
                }
                , dom: '<"col-xs-4 no-padding"B><"col-xs-4 dt-title-div no-padding text-center"><"col-xs-4 dt-filter-div no-padding text-right"><"col-xs-12 no-padding"ti>'
                , buttons: buttons
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
                    setTimeout(function () {
                        $.fn.dataTable.tables({ visible: true, api: true }).columns.adjust();
                    }.bind(this), 500);
                }
                , initComplete: function (settings) {
                    application.tables.reloadFooter(settings.sTableId);
                    var $table = $(settings.nTable);
                    var filter = Cookies.get(settings.sTableId + 'filter');
                    var isFiltered = filter ? true : false;
                    var filterhtml = '<div class="input-group input-group-sm">' +
                        '<input type="text" class="form-control dt-search ' + ($table.attr('data-fastsearch') == '' ? 'hidden' : '') + '" placeholder="' + $table.attr('data-fastsearch') + '" ' +
                        'data-view="' + ($table.attr('id')) + '" value="' + (Cookies.get($table.attr('id') + 'fs') || '') + '"/>' +
                        '<span class="input-group-btn">' +
                        '<button type="button" class="btn btnfilter ' + (isFiltered ? 'btn-primary' : 'btn-default') + '" data-view="' + settings.sTableId + '">' +
                        '<i class="fa fa-search fa-flip-horizontal"></i>' +
                        '</button>' +
                        '</span>' +
                        '</div>';
                    $table.closest('.dataTables_wrapper').find('.dt-filter-div').append(filterhtml);
                    $table.closest('.dataTables_wrapper').find('.dt-title-div').text($table.attr('data-title'));
                    setTimeout(function () {
                        $(document).trigger('app-datatable', this.sTableId);
                        if (!application.functions.isMobile() && application.functions.getId() != 0) {
                            $('#' + this.sTableId).closest('.dataTables_wrapper').find('input.dt-search').select().focus();
                        }
                    }.bind(settings), 250);
                    // socket.emit('view:register', $table.attr('data-view'));
                }
                , ordering: data.permissions.orderable
                , pageLength: 50
                , paging: true
                , pagingType: application.functions.isMobile() ? 'simple' : 'simple_numbers'
                , processing: true
                , rowReorder: data.orderable ? {
                    update: false
                } : false
                , rowId: 'id'
                , scrollCollapse: true
                , scrollX: true
                , scrollY: $('#view' + data.name).attr('data-height') || $('#view' + data.name).attr('data-subview') ? '330px' : application.functions.getAvailableHeight() + 'px'
                , scroller: {
                    loadingIndicator: true
                }
                , select: {
                    style: 'multi'
                    , info: false
                }
                , serverSide: true
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
            }).on('row-reorder', function (e, diff, edit) {
                var $table = $(e.delegateTarget);
                var tableid = $table[0].id;
                var view = $table.attr('data-view');
                var data = [];
                for (var i = 0; i < diff.length; i++) {
                    var rowData = tables[tableid].row(diff[i].node).data();
                    data.push({ id: rowData.id, order: diff[i].newPosition + 1 });
                }
                if (data.length > 0)
                    $.ajax({
                        url: '/v/' + view + '/reorder'
                        , type: 'POST'
                        , dataType: 'json'
                        , data: { data: data }
                        , success: function (response) {
                            application.handlers.responseSuccess(response);
                            application.view.reload('view' + response.view, false);
                        }
                        , error: function (response) {
                            application.handlers.responseError(response);
                        }
                    });
            }).on('dblclick touchstart touchend touchmove', 'tbody tr', function (e) {
                var $table = $(e.delegateTarget);
                var view = $table.attr('data-view');
                var subview = $table.attr('data-subview');
                var tableid = $table[0].id;
                if ($table.attr('data-readonly') == 'true') {
                    return;
                }
                var selected = application.functions.getKeyFromArrayObject(tables[tableid].rows({ selected: true }).data(), 'id');
                var href = '/v/' + view + '/' + tables[tableid].row(this).data().id + (subview ? '?subview=' + subview + '&parent=' + application.functions.getId() : '')
                if (e.type == 'touchstart') {
                    touchStart(function () {
                        window.location.href = href;
                    });
                } else if (e.type == 'touchend' || e.type == 'touchmove') {
                    touchEnd();
                }
                if (!application.functions.isMobile()) {
                    if (e.ctrlKey || selected.length > 1) {
                        window.open(href);
                    } else {
                        window.location.href = href;
                    }
                }
            });
        }
        , deselectAll: function (idtable) {
            tables[idtable].rows().deselect();
            var $table = $('#' + idtable);
            $table.attr('data-selected', '');
            var $dtSelectCount = $table.closest('.dataTables_wrapper').find('.dt-select-count');
            $dtSelectCount.text('');
            $dtSelectCount.closest('button').removeClass('btn-primary').addClass('btn-default');
        }
        , reload: function (idtable, keepSelection) {
            if (!tables[idtable])
                return;
            if (!keepSelection) {
                application.tables.deselectAll(idtable);
            }
            tables[idtable].ajax.reload(function () {
                $('#' + this.table).parent().scrollTop(this.scrollTop);
            }.bind({ table: idtable, scrollTop: keepSelection ? 0 : $('#' + idtable).parent('div.dataTables_scrollBody').scrollTop() }), false);
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
                    url: '/datasource/sum'
                    , type: 'POST'
                    , dataType: 'json'
                    , data: {
                        id: application.functions.getId()
                        , view: $this.attr('data-view')
                        , idmodelattribute: $this.attr('data-attribute')
                        , subview: $('#' + idtable).attr('data-subview')
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
                    value = value.split(',');
                    var icons = [];
                    for (var i = 0; i < value.length; i++) {
                        if (value) {
                            icons.push('<i class="' + value[i] + '"></i>');
                        }
                    }
                    return icons.join('');
                } else {
                    return '';
                }
            }
            , file: function (value) {
                if (value) {
                    var j = JSON.parse(value);
                    if (j.length == 1 && j[0].mimetype.match(/image.*/)) {
                        return '<img src="/file/' + j[0].id + '" style="max-height: 17px;">';
                    } else {
                        return '<span class="fa-stack" style="font-size:8px;"><i class="fa-2x far fa-file"></i><strong class="fa-stack-1x">' + j.length + '</strong></span>';
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
            , div: function (value) {
                if (value == null) {
                    value = '';
                }
                var styles = [];
                styles.push('height:' + (18.5 * this.lineheight) + 'px');
                if (this.lineheight == 1) {
                    styles.push('white-space:nowrap');
                }
                if (value.toString().includes('data-bg-color'))
                    styles.push('background-color:' + $(value).attr('data-bg-color'));
                return '<div class="dt-cell" style="' + styles.join(';') + '">' + value + '</div>';
            }
            , label: function (value) {
                if (value) {
                    var splited = value.toString().split('@');
                    if (splited.length == 2) {
                        return '<span class="label label-' + splited[1] + '">' + splited[0] + '</span>';
                    } else {
                        return value;
                    }
                } else {
                    return '';
                }
            }
            , progressbar: function (value) {
                return '<div class="progress"><div class="progress-bar" style="width: ' + value + '%;background-color:' + application.functions.hsl_col_perc(value, 0, 100) + '">' + value + '%</div></div>';
            }
        }
        , saveFilter: function (view) {
            var $modal = $('div#' + view + 'filter');
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
            var $button = $('button.btnfilter[data-view="' + view + '"]');
            if (cookie.length > 0) {
                $button.removeClass('btn-default').addClass('btn-primary');
                Cookies.set($modal[0].id, JSON.stringify(cookie), { expires: 0.5 });
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
            var url = window.location.href;
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
            var $element = $selector.find('input,textarea,select,radio').filter(':enabled:visible:first');
            if ($element.attr('data-type') == 'autocomplete') {
                $element.select2('open');
            } else {
                $element.focus();
            }
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
        , getPageConf: function () {
            var item = localStorage.getItem(window.location.href);
            return item ? JSON.parse(item) : {};
        }
        , setPageConf: function (conf) {
            var pageconf = application.functions.getPageConf();
            pageconf = $.extend(pageconf, conf);
            localStorage.setItem(window.location.href, JSON.stringify(pageconf));
        }
        , parseFloat: function (value) {
            if (value == '') {
                return 0.0;
            } else {
                return parseFloat(value.replace(/\./g, '').replace(',', '.'));
            }
        }
        , serializeForm: function ($form) {
            var ret = $form.serializeJSON({ parseBooleans: true });
            $form.find('[data-type="autocomplete"]').each(function () {
                var $field = $(this);
                ret[$field.attr('name')] = $field.val();
            });
            return ret;
        }
        , getKeyFromArrayObject: function (o, k) {
            var array = [];
            for (var i = 0; i < o.length; i++) {
                array.push(o[i][k]);
            }
            return array;
        }
        , getAvailableHeight: function () {
            return $(window).height() - 175 - $('header.main-header').innerHeight() - $('section.content-header').innerHeight();
        }
        , setAutocomplete: function ($el, id, text) {
            if ($el.attr('data-options')) {
                $el.val(id);
            } else {
                $el.find('option').remove();
                var newOption = new Option(text, id, false, false);
                $el.append(newOption);
            }
            $el.trigger('change');
        }
        , randomColor: function () {
            return "#000000".replace(/0/g, function () { return (~~(Math.random() * 16)).toString(16); });
        }
        , getClosestLatLang: function (alreadyPloted, cord, distance) {
            var direction = application.functions.randomIntFromInterval(1, 4);
            var lat = parseFloat(cord.split(',')[0]);
            var lng = parseFloat(cord.split(',')[1]);
            switch (direction) {
                case 1://Cima
                    lng += distance;
                    break;
                case 2://Direita
                    lat += distance;
                    break;
                case 3://Baixo
                    lng -= distance;
                    break;
                case 4://Esquerda
                    lat -= distance;
                    break;
            }
            var newcords = lat.toFixed(7) + ',' + lng.toFixed(7);
            if (alreadyPloted[newcords]) {
                distance = distance * 2;
                return application.functions.getClosestLatLang(alreadyPloted, cord, distance);
            }
            return newcords;
        }
        , randomIntFromInterval: function (min, max) {
            return Math.floor(Math.random() * (max - min + 1) + min);
        }
        , hsl_col_perc: function (percent, start, end) {
            var a = percent / 100,
                b = (end - start) * a,
                c = b + start;
            return 'hsl(' + c + ', 85%, 45%, 1)';
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
                        return window.close();
                    }
                }

                if ('redirect' in response) {
                    if (application.functions.getId() == 0) {
                        window.history.replaceState(null, null, response.redirect);
                    }
                    if ('subview_redirect' in response) {
                        Cookies.remove('subview_redirect');
                        localStorage.removeItem('msg');
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
                        if ($(this).parent()[0] && $(this).parent()[0].tagName == 'BODY') {
                            $(this).remove();
                        } else {
                            $(this).parent().remove();
                        }
                    });
                } else {
                    setTimeout(function () {
                        eventFromRegister = false;
                    }, 500);
                }

                if ('reloadtables' in response && response.reloadtables) {
                    if (eventFromRegister) {
                        return window.location.reload();
                    } else {
                        application.view.reloadAll(false);
                    }
                }

            } else {

                var subview_redirect = Cookies.get('subview_redirect');
                if (subview_redirect) {
                    Cookies.remove('subview_redirect');
                    if (application.functions.getId() > 0)
                        return window.location.href = subview_redirect;
                }

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
    , view: {
        getConfig: function (view, callback) {
            var cacheconfig = localStorage.getItem('Vconfig_' + window.location.pathname + '_' + view);
            if (cacheconfig) {
                callback(JSON.parse(cacheconfig));
            } else {
                $.ajax({
                    url: '/v/' + view + '/config'
                    , type: 'GET'
                    , dataType: 'json'
                    , data: {
                        subview: $('[data-view="' + view + '"]').attr('data-subview')
                    }
                    , success: function (response) {
                        if (response.success)
                            localStorage.setItem('Vconfig_' + window.location.pathname + '_' + view, JSON.stringify(response));
                        callback(response);
                    }
                    , error: function (response) {
                        callback(response);
                    }
                });
            }
        }
        , reload: function (view, keepSelection) {
            if (tables[view])
                application.tables.reload(view, keepSelection);
            if (calendar)
                calendar.refetchEvents();
        }
        , reloadAll: function (keepSelection) {
            for (var k in tables)
                application.tables.reload(k, keepSelection);
            if (calendar)
                calendar.refetchEvents();
        }
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