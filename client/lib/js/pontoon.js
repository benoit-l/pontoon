(function () {

  var Pontoon = {
        _doc: window,
        _ptn: window.top,
        _locale: "",
        _meta: {},
        _data: {}
  	  },
      jqueryAppended = false,
      script = document.createElement('script');

  // Main code
  function jqueryLoaded() {
    $.noConflict();
    jQuery(document).ready(function($) {



      /*
       * window.postMessage improved
       *
       * messageType data type to be sent to the other window
       * messageValue data value to be sent to the other window
       * otherWindow reference to another window
       * targetOrigin specifies what the origin of otherWindow must be
      */
      function postMessage(messageType, messageValue, otherWindow, targetOrigin) {
        var otherWindow = otherWindow || Pontoon._ptn,
            targetOrigin = targetOrigin || "*", // TODO: hardcode Pontoon domain name
            message = {
              type: messageType,
              value: messageValue
            }
        otherWindow.postMessage(JSON.stringify(message), targetOrigin);
      }



      /**
       * Send data to main Pontoon code
       */
      function sendData() {
        // Deep copy: http://api.jquery.com/jQuery.extend
        var data = $.extend(true, {}, Pontoon._data);
        $(data.entities).each(function () {
          delete this.node;
        });

        postMessage("data", data);
      }



      /**
       * Render main UI and handle events
       */
      function renderHandle() {
        sendData();
        postMessage("render");

        // Update UI and progress when saved
        $(".editableToolbar > .save").click(function () {
          var element = $(this).parent().get(0).target,
              entity = element.entity;

          entity.translation = $($(element).clone()).html();
          sendData();
          postMessage("save", entity.id);
        });

        // Update progress when cancelled
        $(".editableToolbar > .cancel").click(function () {
          var element = $(this).parent().get(0).target,
              entity = element.entity;

          $(element).html(element.prevValue);
          entity.translation = "";
          sendData();
          postMessage("cancel", entity.id);
        });
      }



      /**
       * Extend entity object
       * TODO: move to main.js
       * 
       * e Temporary entity object
       */
      function extendEntity(e) {
        e.hover = function () {
          this.node.get(0).showToolbar();
          postMessage("hover", this.id);
        };
        e.unhover = function () {
          this.node.get(0).hideToolbar();
          postMessage("hover", this.id);
        };
      }



      /**
       * Makes DOM nodes editable using contentEditable property
       * Based on editableText plugin by Andris Valums, http://valums.com
       *
       * node DOM node
       */ 
      function makeEditable(node) {
        // Save value to restore if user presses cancel
        node.prevValue = $(node).html().toString();

        // Show/hide toolbar
        node.showToolbar = function () {
          showToolbar(this);
        }
        node.hideToolbar = function () {
          hideToolbar(this);
        }

        // Hover handler
        $(node).hover(function () {
          this.entity.hover();
        }, function() {
          this.entity.unhover();
        });
      }



      /**
       * Extract entities from the document, not prepared for working with Pontoon
       * 
       * Create entity object from every non-empty text node
       * Exclude nodes from special tags, e.g. <script> and <link>
       * Skip nodes already included in parent nodes
       * Add temporary pontoon-entity class to prevent duplicate entities when guessing
       */ 
      function guessEntities() {
        Pontoon._data.entities = [];
        var counter = 0; // TODO: use IDs or XPath

        $(':not("script, style")').contents().each(function () {
          if (this.nodeType === Node.TEXT_NODE && $.trim(this.nodeValue).length > 0 && $(this).parents(".pontoon-entity").length === 0) {
            var entity = {};
            entity.id = counter;
            counter++;
            entity.original = $(this).parent().html();

            // Head entities cannot be edited in-place
            if ($(this).parents('head').length === 0) {
              // TODO: remove entity.node from Pontoon._data?
              entity.node = $(this).parent(); // HTML Element holding string
              entity.body = true;
              makeEditable(entity.node.get(0)); // Make nodes editable
              entity.node.get(0).entity = entity; // Store entity reference to the node
              extendEntity(entity);
            }

            Pontoon._data.entities.push(entity);
            $(this).parent().addClass("pontoon-entity");
          }
        });

        $(".pontoon-entity").removeClass("pontoon-entity");
        renderHandle();
      }



      /**
       * Load data from external meta file: original string, translation, comment, suggestions...
       * Match with each string in the document, which is prepended with l10n comment nodes
       * Example: <!--l10n-->Hello World
       *
       * Create entity objects
       * Remove comment nodes
       */
      function loadEntities() {
        var prefix = 'l10n',
            counter = 1, // TODO: use IDs or XPath
            parent = null;

        $.getJSON("pontoon/" + Pontoon._locale + ".json").success(function (data) {
          Pontoon._data = data;
          var entities = Pontoon._data.entities;

          $('*').contents().each(function () {
            if (this.nodeType === Node.COMMENT_NODE && this.nodeValue.indexOf(prefix) === 0) {
              var entity = entities[counter],
                  translation = entity.translation;

              parent = $(this).parent();
              if (translation.length > 0) {
                parent.html(translation);
              } else {
                $(this).remove();
              }

              entity.id = counter;
              // TODO: remove entity.node from Pontoon._data?
              entity.node = parent; // HTML Element holding string
              entity.body = true;
              makeEditable(entity.node.get(0)); // Make nodes editable
              entity.node.get(0).entity = entity; // Store entity reference to the node
              extendEntity(entity);
              counter++;
            }
          });
          renderHandle();
        });
      }



      /**
       * Show editable toolbar
       *
       * node DOM node
       */
      function showToolbar(node) {
        if ($(node).is('.editableToolbar')) {
          $(node).get(0).target.entity.hover();
          return true;
        } else {       
          var toolbar = $('.editableToolbar'),
              curTarget = toolbar.get(0).target,
              newTarget = node;
          if ($(curTarget).attr('contentEditable') === 'true') {
            return;
          }
          if (curTarget && curTarget !== newTarget) {
            hideToolbar(curTarget);
          }
          var left = newTarget.getBoundingClientRect().left + window.scrollX,
              top = newTarget.getBoundingClientRect().top + window.scrollY;
          toolbar.css('left', left + 'px')
                 .css('top', top-21 + 'px');
        }           
        var toolbarNode = toolbar.get(0);
        if (toolbarNode.I !== null) {
          clearTimeout(toolbarNode.I);
          toolbarNode.I = null;
        }
        if (newTarget) {
          toolbarNode.target = newTarget;
        }
        $(newTarget).addClass('hovered');
        toolbar.show();
      }



      /**
       * Hide editable toolbar
       *
       * node DOM node
       */
      function hideToolbar(node) {
        if ($(node).is('.editableToolbar')) {
          var toolbar = $(node);
        } else {
          var toolbar = $('.editableToolbar');
        }
        var toolbarNode = toolbar.get(0),
            target = toolbarNode.target;
        if ($(target).attr('contentEditable') === 'true') {
          return;
        }
        function hide() {
          if (target) {
            target.blur();
            stopEditing();
            if (target === toolbar.get(0).target) {
              toolbar.get(0).target = null;
              $(target).removeClass('hovered');
              toolbar.hide();
            } else {
              $(target).removeClass('hovered');
            }
          }
        }
        toolbar.get(0).I = setTimeout(hide, 50);
      }



      /**
       * Enable editable mode
       * TODO: remove toolbar parameter and use selector instead
       */
      function startEditing() {
      	var toolbar = $('.editableToolbar');
        toolbar.children().show().end()
          .find('.edit').hide();
        var target = toolbar.get(0).target;
        $(target).attr('contentEditable', true);
        $(target.entity.ui).addClass("active");
        target.focus();
      }



      /**
       * Disable editable mode
       * TODO: remove toolbar parameter and use selector instead
       */
      function stopEditing() {
      	var toolbar = $('.editableToolbar');
        toolbar.children().hide().end()
          .find('.edit').show();
        var target = toolbar.get(0).target;
        $(target).attr('contentEditable', false);
        $(target.entity.ui).removeClass("active");
      }



      /**
       * Handle messages from project code
       */
      function receiveMessage(e) {
        if (e.source === Pontoon._ptn) { // TODO: hardcode Pontoon domain name
          var message = JSON.parse(e.data);
          if (message.type === "hover") {
            Pontoon._data.entities[message.value].hover();
          } else if (message.type === "unhover") {
            Pontoon._data.entities[message.value].unhover();
          } else if (message.type === "edit") {
            $('.editableToolbar > .edit').click();
          } else if (message.type === "drag") {
            $("#context .mode").attr("label", message.value + " mode");
          }
        }
      }

      // Wait for main code messages
      window.addEventListener("message", receiveMessage, false);

      // Inject toolbar stylesheet
      $('<link>', {
        rel: 'stylesheet',
        href: '../../client/lib/css/editable.css'
      }).appendTo('head');

      // Prepare editable toolbar
      var toolbar = $(
        "<div class='editableToolbar'>" +
          "<a href='#' class='edit'></a>" +
          "<a href='#' class='save'></a>" +
          "<a href='#' class='cancel'></a>" +
        "</div>").appendTo($('body'));
      toolbar.hover(function () {
        showToolbar(this);
      }, function () {
        this.target.entity.unhover();
      })
      .find('.edit').click(function () {
        startEditing();
        return false;
      }).end()
      .find('.save, .cancel').click(function () {
        stopEditing();
        return false;
      });

      // Enable context menu
      $('body')
        .attr("contextmenu", "context")
        .append(
        '<menu type="context" id="context">' +
          '<menuitem class="mode" label="Advanced mode" icon="../../client/lib/images/logo-small.png"></menuitem>' +
        '</menu>')
        .find("#context .mode").live("click", function() {
          $("#switch").click();
          if ($("#main").is(".opened")) {
            $(this).attr("label", "Basic mode");
          } else {
            $(this).attr("label", "Advanced mode");
          }
        });

      // Determine if the current page is prepared for working with Pontoon
      var meta = $('head > meta[name=Pontoon]');
      if (meta.length > 0) {
        if (meta.attr('content')) {
          Pontoon._meta.project = meta.attr('content');
        }
        if (meta.attr('data-ip')) {
          Pontoon._meta.url = meta.attr('data-ip');
        }
        loadEntities();
      } else {
        // Read meta values
        guessEntities();
      }

    });
  }

  // Load jQuery if not loaded yet
  function loadJquery() {
    if (!window.jQuery) {
      if (!jqueryAppended) {
        script.src = "//ajax.googleapis.com/ajax/libs/jquery/1.6.4/jquery.min.js";
        document.body.appendChild(script);
        jqueryAppended = true;
        arguments.callee();
      } else {
        window.setTimeout(arguments.callee, 100);
  	  }
    } else {
      jqueryLoaded();
    }
  }

  // Wait for main code trigger
  function initizalize(e) {
    // Prevent execution of any code if page not loaded in Pontoon iframe
    if (e.source === Pontoon._ptn) { // TODO: hardcode Pontoon domain name
      var message = JSON.parse(e.data);
      if (message.type === "locale") {
        Pontoon._locale = message.value; // Set locale
        loadJquery();
        window.removeEventListener("message", initizalize, false);
      }
    }
  }
  window.addEventListener("message", initizalize, false);
  
})();