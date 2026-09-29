use crate::error::ApiError;
use regex::Regex;
use std::sync::LazyLock;

#[cfg(test)]
mod valid_name_tests {
    use super::*;

    #[test]
    fn valid_names() {
        let valid_names = [
            "test",
            "with space",
            "with 1234",
            "123",
            "with-dash",
            "dash-and space",
            "CAPITAL LETTERS",
            "MiXeD case-123",
            "0123456789",
            "underscore_name",
            " space",
            "space ",
        ];

        for name in valid_names {
            assert!(valid_name(name), "{} should have been a valid name", name);
        }
    }

    #[test]
    fn invalid_names() {
        let invalid_names = [
            "@SHARED",
            "invalid!",
            "@",
            "-=+[];'./,<>?\"\\|`~",
            "=",
            "+",
            "[",
            "]",
            ";",
            "'",
            ".",
            "/",
            ",",
            "<",
            ">",
            "?",
            "\"",
            "\\",
            "|",
            "`",
            "~",
            "",
            " ",
            "                 ",
        ];

        for name in invalid_names {
            assert!(
                !valid_name(name),
                "{} should have been an invalid name",
                name
            );
        }
    }
}

static NAME_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new("[^A-Za-z 0-9-_]").unwrap());

pub fn valid_name(name: &str) -> bool {
    let len = name.len();
    (1..=16).contains(&len) && name.is_ascii() && !NAME_RE.is_match(name) && !name.trim().is_empty()
}

pub enum ArrayFormat {
    Flat,
    ItemPairs,
}

pub fn validate_member_prop_length<T>(
    prop_name: &str,
    value: &Option<Vec<T>>,
    min: usize,
    max: usize,
    format: ArrayFormat,
) -> Result<(), ApiError> {
    let Some(x) = value else {
        return Ok(());
    };
    let len = x.len();
    if !(min..=max).contains(&len) {
        return Err(ApiError::GroupMemberValidationError(format!(
            "{} length violated range constraint {}..={} actual={}",
            prop_name, min, max, len
        )));
    }
    if matches!(format, ArrayFormat::ItemPairs) && len % 2 != 0 {
        return Err(ApiError::GroupMemberValidationError(format!(
            "{} must have an even number of elements (item-id/quantity pairs), got {}",
            prop_name, len
        )));
    }
    Ok(())
}
