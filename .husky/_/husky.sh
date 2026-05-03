#!/usr/bin/env sh
if [ -z "$husky_skip_init" ]; then
  debug () {
    if [ "$HUSKY_DEBUG" = "1" ]; then
      echo "husky: $1"
    fi
  }

  readonly hook_name="$(basename -- "$0")"
  debug "running $hook_name..."

  if [ "$HUSKY" = "0" ]; then
    debug "HUSKY=0, skipping hook"
    exit 0
  fi

  if [ -f ~/.huskyrc ]; then
    debug "sourcing ~/.huskyrc"
    . ~/.huskyrc
  fi

  export readonly HUSKY_GIT_PARAMS="$*"
  export readonly GIT_PARAMS="$*"

  if [ -f ~/.huskyrc ]; then
    debug "sourcing ~/.huskyrc"
    . ~/.huskyrc
  fi
fi
